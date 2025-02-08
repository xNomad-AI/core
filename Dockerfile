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
# remove devDependencies
RUN pnpm prune --production

FROM node:23.5.0-bookworm AS runner

WORKDIR /app

COPY --from=base /app/dist /app/dist
COPY --from=base /app/node_modules /app/node_modules
COPY --from=base /app/src/eliza/packages /app/src/eliza/packages

# RUN wget https://gobinaries.com/tj/node-prune --output-document - | /bin/sh && node-prune

CMD [ "node", "dist/main.js" ]
