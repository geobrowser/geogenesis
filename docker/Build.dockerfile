# Setup

FROM node:18.8.0-alpine3.16 AS base

ARG TURBO_TEAM
ARG TURBO_TOKEN

RUN apk --no-cache add curl python3 build-base jq yq

# RUN curl -f https://get.pnpm.io/install.sh | node - add --global pnpm
RUN npm install -g pnpm@7.30.5

WORKDIR /app

COPY pnpm-lock.yaml .
# RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
#   pnpm fetch
# Install

ENV TURBO_TEAM=$TURBO_TEAM
ENV TURBO_TOKEN=$TURBO_TOKEN
ENV TURBO_REMOTE_ONLY=true

COPY . .

RUN pnpm install --recursive --frozen-lockfile
RUN pnpm build
