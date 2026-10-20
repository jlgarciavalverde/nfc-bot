# syntax=docker/dockerfile:1
# Una imagen, dos procesos: la API+panel (`node api/dist/server.js`) y el bot (`node bot/dist/bot.js`).
# Se compila en la arquitectura del Mac (pnpm bajo QEMU falla). Sin dependencias nativas: node_modules vale para amd64.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
RUN npm i -g pnpm@12.4.2
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/bot/package.json apps/bot/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
RUN pnpm --filter @nfc/api build \
 && pnpm --filter @nfc/bot build \
 && pnpm --filter @nfc/web build \
 && pnpm --filter @nfc/api deploy --prod --legacy /out/api \
 && pnpm --filter @nfc/bot deploy --prod --legacy /out/bot

FROM node:22-alpine
ARG APP_VERSION=0.0.0
ENV APP_VERSION=$APP_VERSION NODE_ENV=production PORT=3000 WEB_DIR=/app/web
WORKDIR /app
COPY --from=build /out/api/node_modules ./api/node_modules
COPY --from=build /repo/apps/api/dist ./api/dist
COPY --from=build /repo/packages/core/drizzle ./api/drizzle
COPY --from=build /out/bot/node_modules ./bot/node_modules
COPY --from=build /repo/apps/bot/dist ./bot/dist
COPY --from=build /repo/apps/web/dist ./web
USER node
EXPOSE 3000
CMD ["node", "api/dist/server.js"]
