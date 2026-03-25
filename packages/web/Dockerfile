FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/web/package.json packages/web/
COPY shared/package.json shared/
RUN npm ci --workspace=packages/web --workspace=shared --include-workspace-root

COPY shared/ shared/
COPY packages/web/ packages/web/

RUN npm run build --workspace=packages/web

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
