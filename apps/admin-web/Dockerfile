FROM oven/bun:1.3.14 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY tsconfig.base.json eslint.config.js ./
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY libs/api-contract/package.json libs/api-contract/package.json
RUN bun install --frozen-lockfile

FROM deps AS builder
COPY apps/admin-web apps/admin-web
COPY libs/api-contract libs/api-contract
RUN bun run --cwd apps/admin-web build

FROM oven/bun:1.3.14 AS runner
WORKDIR /app/apps/admin-web
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3002

COPY --from=builder /app/apps/admin-web/.output .output
USER bun
CMD ["bun", ".output/server/index.mjs"]
