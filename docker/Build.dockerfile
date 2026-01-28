# Setup

FROM oven/bun:1.3.6-alpine AS base

ARG TURBO_TEAM
ARG TURBO_TOKEN

RUN apk --no-cache add curl python3 build-base jq yq

WORKDIR /app

COPY bun.lock .

ENV TURBO_TEAM=$TURBO_TEAM
ENV TURBO_TOKEN=$TURBO_TOKEN
ENV TURBO_REMOTE_ONLY=true

COPY . .

RUN bun install --frozen-lockfile
RUN bun build
