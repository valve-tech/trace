# ----------------------------------------------------------------------------
# Build stage — installs every workspace, builds sdk → api → web. The whole
# stage is discarded after we copy the dist directories into the production
# image.
# ----------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Lockfile + each workspace's package.json so `npm ci` can resolve cleanly.
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/sdk/package.json packages/sdk/
COPY packages/web/package.json packages/web/
COPY shared/package.json shared/

# All workspaces, including dev deps (vite, tailwind, tsc, etc.).
RUN npm ci --include-workspace-root

# Sources
COPY shared/ shared/
COPY packages/sdk/ packages/sdk/
COPY packages/api/ packages/api/
COPY packages/web/ packages/web/

# Build order: sdk first (web imports its compiled dist), then api + web in parallel.
RUN npm run build --workspace=packages/sdk
RUN npm run build --workspace=packages/api && npm run build --workspace=packages/web

# ----------------------------------------------------------------------------
# Production stage — slim node:22-alpine, only the api + shared workspaces
# installed without dev deps. Copies the compiled api/dist and web/dist from
# the build stage.
# ----------------------------------------------------------------------------
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY shared/package.json shared/
RUN npm ci --workspace=packages/api --workspace=shared --include-workspace-root --omit=dev

COPY shared/ shared/
COPY --from=build /app/packages/api/dist packages/api/dist
COPY packages/api/migrations packages/api/migrations
COPY --from=build /app/packages/web/dist packages/web/dist

EXPOSE 10100
CMD ["node", "packages/api/dist/index.js"]
