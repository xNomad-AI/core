FROM node:23.5.0-bookworm

WORKDIR /app

RUN apt-get update && \
    apt-get install build-essential -y && \
    npm install -g node-gyp

RUN npm install -g pnpm@9.15.2

COPY . .

# RUN pnpm install
# RUN pnpm run build
