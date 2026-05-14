# ─── Stage 1: Build (next@15.3.2) ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json  ./apps/api/
COPY apps/web/package.json  ./apps/web/

RUN npm ci --workspace=apps/web

COPY apps/web ./apps/web

ENV NEXT_TELEMETRY_DISABLED=1
# NODE_ENV=production is set by Next.js automatically during `next build`,
# which causes next.config.ts rewrites to target http://gip-api:3001 (Docker DNS).
RUN npm run build --workspace=apps/web

RUN npm prune --omit=dev

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/node_modules       ./node_modules
COPY --from=builder /app/apps/web/.next     ./apps/web/.next
# public/ may be empty; ensure the directory exists before copying
RUN mkdir -p ./apps/web/public
COPY --from=builder /app/apps/web/public    ./apps/web/public

COPY package.json              ./
COPY apps/web/package.json    ./apps/web/

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Rewrites are baked in at build time via NODE_ENV=production check in next.config.ts.
CMD ["npm", "run", "start", "--workspace=apps/web"]
