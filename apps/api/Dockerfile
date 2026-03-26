# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Build tools required for native addons (ssh2 → cpu-features, etc.)
RUN apk add --no-cache python3 make g++

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json  ./apps/api/
COPY apps/web/package.json  ./apps/web/

# Install all workspace deps
RUN npm ci

# Copy API source and compile
COPY apps/api ./apps/api
RUN npm run build --workspace=apps/api

# Remove dev dependencies
RUN npm prune --omit=dev

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Copy pruned node_modules (includes pre-built native binaries for Alpine)
COPY --from=builder /app/node_modules    ./node_modules
COPY --from=builder /app/apps/api/dist  ./apps/api/dist

# Needed so Node can resolve workspace package names
COPY package.json              ./
COPY apps/api/package.json    ./apps/api/

EXPOSE 3001

ENV NODE_ENV=production

# The SSH private key used for tunnels is expected at the path set by SSH_KEY_PATH.
# In docker-compose it is volume-mounted from the host at /run/secrets/tunnel_key.
CMD ["node", "apps/api/dist/main.js"]
