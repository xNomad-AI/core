FROM node:23.5.0-bookworm AS base

WORKDIR /app

RUN npm install -g pnpm@9.15.2
RUN apt-get update && \
    apt-get install build-essential -y

COPY . .

# RUN pnpm install --frozen-lockfile
RUN pnpm install
# build workspace packages
RUN pnpm run build
# remove devDependencies
RUN pnpm prune --production

CMD [ "node", "dist/main.js" ]
