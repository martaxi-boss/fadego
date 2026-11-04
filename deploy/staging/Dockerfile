# Optional, isolated FADEGO staging image. No credentials are baked in.
FROM node:22-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL="postgresql://build:unused@127.0.0.1:5432/build?schema=public" pnpm install --frozen-lockfile
COPY . .
RUN NEXT_TELEMETRY_DISABLED=1 DATABASE_URL="postgresql://build:unused@127.0.0.1:5432/build?schema=public" NEXTAUTH_URL="https://fadego.duckdns.org" NEXTAUTH_SECRET="build-only-no-real-secret" pnpm build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.14.0 --activate
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=node:node /app /app
RUN mkdir -p /app/.next/cache && chown -R node:node /app/.next/cache
USER node
EXPOSE 3000
CMD ["pnpm", "start", "--hostname", "0.0.0.0"]
