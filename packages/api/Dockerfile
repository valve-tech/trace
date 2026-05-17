FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY shared/package.json shared/
RUN npm ci --workspace=packages/api --workspace=shared --include-workspace-root

# Copy source
COPY shared/ shared/
COPY packages/api/ packages/api/

# Build
RUN npm run build --workspace=packages/api

# Production
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY shared/package.json shared/
RUN npm ci --workspace=packages/api --workspace=shared --include-workspace-root --omit=dev

COPY shared/ shared/
COPY --from=base /app/packages/api/dist packages/api/dist
COPY packages/api/migrations packages/api/migrations

EXPOSE 10100
CMD ["node", "packages/api/dist/index.js"]
