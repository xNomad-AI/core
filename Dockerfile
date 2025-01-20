FROM node:23-bookworm as base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile && \
  pnpm add @elizaos/client-twitter@0.1.7-alpha.2

FROM base as build

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM base as runner

COPY --from=build /app/dist /app/dist
CMD [ "node", "dist/main.js" ]
