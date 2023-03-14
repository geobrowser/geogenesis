# Setup

FROM node:18.8.0-alpine3.16 AS base

ARG TURBO_TEAM
ARG TURBO_TOKEN
ARG NPM_TOKEN

RUN apk --no-cache add curl python3 build-base jq yq

RUN curl -f https://get.pnpm.io/v6.16.js | node - add --global pnpm

WORKDIR /app

COPY pnpm-lock.yaml .
COPY .npmrc .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm fetch

# Install

ENV TURBO_TEAM=$TURBO_TEAM
ENV TURBO_TOKEN=$TURBO_TOKEN
ENV NPM_TOKEN=$NPM_TOKEN
ENV TURBO_REMOTE_ONLY=true

COPY . . 

RUN pnpm install --recursive --offline --frozen-lockfile
RUN pnpm build
