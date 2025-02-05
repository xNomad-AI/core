FROM node:23.5.0-bookworm AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

FROM base AS build

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM base AS runner

COPY --from=build /app/dist /app/dist
CMD [ "node", "dist/main.js" ]
