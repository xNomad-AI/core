FROM node:23.5.0-bookworm AS base

WORKDIR /app

RUN npm install -g pnpm@9.15.2

COPY . .

RUN pnpm install
RUN pnpm run build
RUN pnpm prune --production

CMD [ "node", "dist/main-wallet-service.js" ]
