FROM oven/bun:1.3.6-slim AS base
COPY . /app
WORKDIR /app

FROM base AS build
RUN bun install
RUN bun run build

FROM base
COPY --from=build /app/dist /app/dist
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/sink /app/sink

CMD [ "bun", "start", "--start-block", "620", "--reset-db"]
