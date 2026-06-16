FROM oven/bun:1.3.14 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY tsconfig.base.json eslint.config.js ./
COPY apps/customer-web/package.json apps/customer-web/package.json
COPY libs/api-contract/package.json libs/api-contract/package.json
RUN bun install --frozen-lockfile

FROM deps AS builder
COPY apps/customer-web apps/customer-web
COPY libs/api-contract libs/api-contract
RUN bun run --cwd apps/customer-web build

FROM oven/bun:1.3.14 AS runner
WORKDIR /app/apps/customer-web
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/apps/customer-web/.output .output
USER bun
CMD ["bun", ".output/server/index.mjs"]
