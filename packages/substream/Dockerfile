FROM node:18-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

# TODO: Frozen lockfile. Right now we don't use frozen lockfile because
# railway is having trouble with our lockfile. Might be because this
# is a monorepo. Once we have github-based CI the frozen lockfile should
# work as expected.
FROM base AS build
RUN pnpm install
RUN pnpm run build

FROM base
COPY --from=build /app/dist /app/dist
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/src/sql /app/src/sql

# TODO: Figure out how to set up schema for DB as part of
# postgres setup
CMD [ "pnpm", "start", "--from-cache", "--from-genesis"]