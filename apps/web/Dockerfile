FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json ./
RUN pnpm install --ignore-scripts

FROM base AS development
COPY . .
CMD ["node_modules/.bin/next", "dev", "--port", "3000"]

FROM base AS builder
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so they
# must be present as build args/env here, not just at container runtime.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
COPY . .
RUN node_modules/.bin/next build

FROM node:22-alpine AS production
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER node
CMD ["node", "server.js"]
