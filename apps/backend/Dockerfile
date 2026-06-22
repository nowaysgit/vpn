FROM oven/bun:1.3.14 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY tsconfig.base.json eslint.config.js ./
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY apps/customer-web/package.json apps/customer-web/package.json
COPY apps/provisioning-worker/package.json apps/provisioning-worker/package.json
COPY apps/telegram-bot/package.json apps/telegram-bot/package.json
COPY libs/api-contract/package.json libs/api-contract/package.json
COPY libs/provider-contract/package.json libs/provider-contract/package.json
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=deps /app/node_modules node_modules
COPY package.json bun.lock tsconfig.base.json eslint.config.js ./
COPY apps/backend apps/backend
COPY libs/api-contract libs/api-contract
COPY libs/provider-contract libs/provider-contract

USER bun
WORKDIR /app/apps/backend
CMD ["sh", "-c", "bun run migrate && bun src/index.ts"]
