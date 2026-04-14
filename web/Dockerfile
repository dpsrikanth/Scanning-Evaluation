FROM node:20-alpine AS build

# Install Yarn 1 from the official release tarball (no npm global / Corepack fetch).
# npm has been observed to abort mid-install on some Docker Desktop setups ("Exit handler never called"),
# leaving node_modules incomplete; bootstrapping Yarn this way avoids npm until `yarn install`.
ARG YARN_VERSION=1.22.22
ADD https://github.com/yarnpkg/yarn/releases/download/v${YARN_VERSION}/yarn-v${YARN_VERSION}.tar.gz /tmp/yarn.tgz
RUN tar -xzf /tmp/yarn.tgz -C /opt \
  && ln -sf /opt/yarn-v${YARN_VERSION}/bin/yarn /usr/local/bin/yarn \
  && ln -sf /opt/yarn-v${YARN_VERSION}/bin/yarnpkg /usr/local/bin/yarnpkg \
  && rm /tmp/yarn.tgz

WORKDIR /app

COPY package.json ./
COPY scripts/sync-pdf-worker.cjs scripts/
RUN mkdir -p public \
  && yarn install --network-timeout 600000 \
  && test -f node_modules/vite/package.json

COPY index.html vite.config.js ./
COPY src/ ./src/
COPY public/ ./public/

ENV NODE_ENV=production
RUN yarn build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
