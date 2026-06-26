FROM node:22-alpine AS build

ARG XRAY_VERSION=26.2.6
WORKDIR /app

RUN apk add --no-cache ca-certificates curl unzip

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
RUN npm run build

RUN curl -fL -o /tmp/xray.zip "https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/Xray-linux-64.zip" \
  && unzip -j /tmp/xray.zip xray -d /usr/local/bin \
  && chmod +x /usr/local/bin/xray \
  && rm -f /tmp/xray.zip

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache ca-certificates curl openssl

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /usr/local/bin/xray /usr/local/bin/xray
COPY --from=build /app/dist ./dist
COPY public ./public

CMD ["node", "dist/server.js"]
