FROM oven/bun:1.3.6-slim AS base
COPY . /app
WORKDIR /app

FROM base AS build
RUN bun install
RUN bun run build

FROM base
COPY --from=build /app/dist /app/dist
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/bun.lock /app/bun.lock
COPY --from=build /app/node_modules /app/node_modules

EXPOSE 3000
CMD [ "bun", "start" ]
