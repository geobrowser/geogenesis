FROM node:18-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Install dependencies scoped to the 'api' package
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY packages/api/package.json packages/api/
COPY packages/sdk/* packages/sdk/
RUN pnpm install --filter api

# Build the 'api' package
COPY packages packages
RUN pnpm run --filter api build

# # Final stage
FROM node:18-slim
WORKDIR /app

# # Copy built application and dependencies for 'api'
COPY --from=base /app/node_modules /app/node_modules
COPY --from=base /app/packages/api/dist /app/packages/api/dist
COPY --from=base /app/packages/api/node_modules /app/packages/api/node_modules
COPY --from=base /app/packages/api/package.json /app/packages/api/package.json
COPY --from=base /app/package.json /app/package.json

CMD ["node", "packages/api/dist/server.js"]