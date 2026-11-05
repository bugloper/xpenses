#!/usr/bin/env bash
# Deploys the current commit to the server.
#
#   bin/deploy.sh [host] [dir]       defaults: lockedsh /opt/xpenses
#
# Stages a clean copy of HEAD next to the live tree (never on top of it:
# extracting over an old tree keeps files that were deleted from the repo,
# and a stale file can break the build), keeps the server's .env, swaps the
# trees, rebuilds the container and checks the health endpoint. Data lives in
# the Docker volume and is untouched. The previous tree is removed only after
# the new one is up; if the build fails, the old tree is put back.
set -euo pipefail

HOST="${1:-lockedsh}"
DIR="${2:-/opt/xpenses}"
NEW="$DIR.new"
PREV="$DIR.prev"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

cd "$(dirname "$0")/.."
if [ -n "$(git status --porcelain)" ]; then
  echo "working tree has uncommitted changes; commit or stash them first (only HEAD is deployed)" >&2
  exit 1
fi
rev="$(git rev-parse --short HEAD)"

echo "==> staging $rev at $HOST:$NEW"
ssh "$HOST" "rm -rf '$NEW' && mkdir -p '$NEW'"
git archive HEAD | ssh "$HOST" "tar -x -C '$NEW' && cp '$DIR/.env' '$NEW/.env'"

echo "==> swapping in and rebuilding"
ssh "$HOST" "set -e
  mv '$DIR' '$PREV' && mv '$NEW' '$DIR'
  if (cd '$DIR' && $COMPOSE up -d --build); then
    rm -rf '$PREV'
  else
    echo 'build failed; restoring the previous tree' >&2
    mv '$DIR' '$NEW' && mv '$PREV' '$DIR'
    (cd '$DIR' && $COMPOSE up -d)
    exit 1
  fi"

echo "==> health"
domain="$(ssh "$HOST" "grep -m1 '^XPENSES_DOMAIN=' /opt/proxy/.env | cut -d= -f2-")"
for i in $(seq 1 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "https://$domain/healthz" || true)"
  if [ "$code" = "200" ]; then
    echo "deployed $rev to https://$domain"
    exit 0
  fi
  sleep 2
done
echo "deployed $rev, but https://$domain/healthz answered $code" >&2
exit 1
