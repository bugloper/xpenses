.PHONY: dev dev-api dev-web build build-web build-api test test-api test-web lint fmt e2e clean

# Run API (port 8080) and Vite dev server (port 5173) together.
dev:
	@$(MAKE) -j2 dev-api dev-web

dev-api:
	XPENSIV_STATIC_DIR= go run ./cmd/server

dev-web:
	cd web && bun run dev

build: build-web build-api

build-web:
	cd web && bun install && bun run build

build-api:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/xpensiv ./cmd/server

test: test-api test-web

test-api:
	go test ./...

test-web:
	cd web && bun run test

e2e:
	cd web && bun run test:e2e

lint:
	gofmt -l . && go vet ./...
	cd web && bun run lint && bun run typecheck

fmt:
	gofmt -w cmd internal
	cd web && bun run format

clean:
	rm -rf bin web/dist
