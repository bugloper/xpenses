# ---- frontend build ----
FROM oven/bun:1 AS web
WORKDIR /app/web
COPY web/package.json web/bun.lock* ./
RUN bun install --frozen-lockfile
COPY web/ .
RUN bun run build

# ---- backend build ----
FROM golang:1.26-alpine AS go
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Pure Go SQLite driver: no CGO needed.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /xpenses ./cmd/server

# ---- runtime ----
FROM alpine:3.21
# Tesseract reads payment screenshots (receipt details); ca-certificates for TLS.
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng ca-certificates \
 && addgroup -S xpenses && adduser -S -G xpenses xpenses \
 && mkdir -p /data /app/web/dist && chown -R xpenses:xpenses /data /app
WORKDIR /app
COPY --from=go /xpenses /app/xpenses
COPY --from=web /app/web/dist /app/web/dist
USER xpenses
ENV XPENSES_ADDR=0.0.0.0:8080 \
    XPENSES_DATA_DIR=/data \
    XPENSES_STATIC_DIR=/app/web/dist \
    XPENSES_CORS_ORIGIN=
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/app/xpenses"]
