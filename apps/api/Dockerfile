FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json ./
RUN pnpm install --ignore-scripts

FROM base AS development
COPY . .
RUN node_modules/.bin/prisma generate
CMD ["node_modules/.bin/tsx", "watch", "src/index.ts"]

FROM base AS builder
COPY . .
RUN node_modules/.bin/prisma generate && node_modules/.bin/tsc

FROM node:22-alpine AS production
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json ./
RUN pnpm install --ignore-scripts --prod
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
CMD ["node", "dist/index.js"]
