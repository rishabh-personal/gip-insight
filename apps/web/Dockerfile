# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json  ./apps/api/
COPY apps/web/package.json  ./apps/web/

RUN npm ci --workspace=apps/web

COPY apps/web ./apps/web

ENV NEXT_TELEMETRY_DISABLED=1

# Build without NEXT_PUBLIC_API_URL → empty string → browser uses relative URLs
# → Next.js rewrites proxy /api/* to the backend container at runtime
RUN npm run build --workspace=apps/web

RUN npm prune --omit=dev

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/node_modules       ./node_modules
COPY --from=builder /app/apps/web/.next     ./apps/web/.next
COPY --from=builder /app/apps/web/public    ./apps/web/public

COPY package.json              ./
COPY apps/web/package.json    ./apps/web/

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# INTERNAL_API_URL is read by next.config.ts rewrites() at server start time
# so it can be overridden via docker-compose environment without rebuilding.
CMD ["npm", "run", "start", "--workspace=apps/web"]
