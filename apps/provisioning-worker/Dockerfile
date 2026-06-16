FROM oven/bun:1.3.14 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY tsconfig.base.json eslint.config.js ./
COPY apps/provisioning-worker/package.json apps/provisioning-worker/package.json
COPY libs/provider-contract/package.json libs/provider-contract/package.json
COPY libs/api-contract/package.json libs/api-contract/package.json
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules node_modules
COPY package.json bun.lock tsconfig.base.json eslint.config.js ./
COPY apps/provisioning-worker apps/provisioning-worker
COPY libs/provider-contract libs/provider-contract
COPY libs/api-contract libs/api-contract

USER bun
WORKDIR /app/apps/provisioning-worker
CMD ["bun", "src/index.ts"]
