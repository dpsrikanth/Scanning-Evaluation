FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
# postinstall needs this script + public/ before npm ci (rest of repo copied later)
COPY scripts/sync-pdf-worker.cjs scripts/
RUN mkdir -p public && npm ci

COPY index.html vite.config.js ./
COPY src/ ./src/
# Include public folder (face-api model weights, favicon, etc.)
COPY public/ ./public/

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
