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
WORKDIR /app
# Reuse the builder's node_modules wholesale rather than a separate `pnpm
# install --prod` — pnpm's isolated store keeps the generated Prisma client
# nested under node_modules/.pnpm/@prisma+client@.../node_modules/.prisma
# (not the top-level node_modules/.prisma a flat npm/yarn install would have),
# so a fresh prod-only install has nothing to run `prisma generate` against
# and no stable path to copy the generated client back in from.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
USER node
CMD ["node", "dist/index.js"]
