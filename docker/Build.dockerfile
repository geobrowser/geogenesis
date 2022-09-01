### base ###

FROM node:18.8.0-alpine3.16 AS base

RUN apk --no-cache add curl python3 build-base

RUN curl -f https://get.pnpm.io/v6.16.js | node - add --global pnpm

WORKDIR /app

COPY pnpm-lock.yaml .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm fetch

### contracts ###

FROM base as contracts

COPY package.json pnpm-workspace.yaml .nvmrc .
COPY ./packages/contracts ./packages/contracts

RUN pnpm install --recursive --offline --frozen-lockfile

