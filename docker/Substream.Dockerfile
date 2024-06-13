FROM node:18-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Install dependencies scoped to the 'substream' package
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY packages/substream/package.json packages/substream/
COPY packages/sdk/* packages/sdk/
RUN pnpm install --filter substream

# Build the 'substream' package
COPY packages packages
RUN pnpm run --filter substream build

# Final stage
FROM node:18-slim
WORKDIR /app

# Copy built application and dependencies for 'substream'
COPY --from=base /app/packages/substream/dist /app/dist
COPY --from=base /app/node_modules /app/node_modules
COPY --from=base /app/packages/substream/package.json /app/package.json
COPY packages/substream/geo-substream.spkg /app/

CMD [ "node", "dist/index.js" ]
