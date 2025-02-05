FROM node:23.5.0-bookworm AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm && pnpm install --prod --frozen-lockfile

FROM base AS build

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM node:23.5.0-bookworm AS runner

WORKDIR /app

COPY --from=build /app/dist /app/dist
COPY --from=base /app/node_modules /app/node_modules
COPY --from=base /app/package.json /app/package.json

RUN wget https://gobinaries.com/tj/node-prune --output-document - | /bin/sh && node-prune

CMD [ "node", "dist/main.js" ]
