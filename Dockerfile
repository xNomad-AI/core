FROM node:23.5.0-bookworm AS base

WORKDIR /app

RUN npm install -g pnpm@9.15.2
RUN apt-get update && \
    apt-get install build-essential -y

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/ ./scripts/
COPY src/eliza/packages ./src/eliza/packages

RUN pnpm preinstall

# RUN pnpm install --frozen-lockfile
RUN pnpm install

COPY . .

# build workspace packages
RUN pnpm run build
# remove devDependencies
RUN pnpm prune --production
RUN cd data/eliza pnpm clean

CMD [ "node", "dist/main.js" ]
