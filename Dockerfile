FROM node:23.5.0-bookworm

RUN git clone https://github.com/xNomad-AI/core.git /app

WORKDIR /app

RUN git checkout develop

RUN npm install -g pnpm && pnpm install -w --frozen-lockfile

RUN pnpm build

CMD ["node", "dist/main.js"]