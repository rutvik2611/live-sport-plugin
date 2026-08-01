# ── Build Stage ──────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY resolver/package*.json ./resolver/

# Install production deps only — devDeps (puppeteer, jest, nock) are not needed
RUN npm ci --omit=dev && cd resolver && npm ci --omit=dev

# Copy source
COPY . .

# ── Runtime Stage ────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /app/data /app/logs && \
    chown -R appuser:appgroup /app/data /app/logs

WORKDIR /app

# Runtime dependencies only
RUN apk add --no-cache curl ca-certificates tzdata

# Copy built artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/resolver/node_modules ./resolver/node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/resolver/src ./resolver/src
COPY --from=builder /app/resolver/public ./resolver/public
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/.env.example ./.env.example

# Non-root user
USER appuser

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -sf http://localhost:${PORT:-7000}/health || exit 1

EXPOSE 7000
ENV NODE_ENV=production \
    PORT=7000 \
    TZ=UTC

CMD ["node", "src/index.js"]