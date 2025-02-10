FROM node:23.5.0-bookworm AS base

WORKDIR /app

RUN npm install -g pnpm@9.15.2
RUN apt-get update && \
    apt-get install build-essential -y && \
    npm install -g node-gyp && \
    npm rebuild better-sqlite3

COPY . .

# RUN pnpm install --frozen-lockfile
RUN pnpm install
# build workspace packages
RUN pnpm run build

# RUN wget https://gobinaries.com/tj/node-prune --output-document - | /bin/sh && node-prune

CMD [ "node", "dist/main.js" ]
