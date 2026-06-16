FROM oven/bun:1.3.14 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY tsconfig.base.json eslint.config.js ./
COPY apps/telegram-bot/package.json apps/telegram-bot/package.json
COPY libs/api-contract/package.json libs/api-contract/package.json
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules node_modules
COPY package.json bun.lock tsconfig.base.json eslint.config.js ./
COPY apps/telegram-bot apps/telegram-bot
COPY libs/api-contract libs/api-contract

USER bun
WORKDIR /app/apps/telegram-bot
CMD ["bun", "src/index.ts"]
