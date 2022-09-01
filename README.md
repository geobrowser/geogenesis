# Geogenesis

Summary

### Monorepo dependencies

- pnpm (version 7+)
- node version (18+)

### Setup

- pnpm install
- pnpm build? Can this happen as part of install?

### Structure

- apps/
- packages/

### Package descriptions

- web
- contracts
- database

### Using the monorepo

- Installing. What happens when you install?
- Building all dependencies
- Running commands in specific directories using pnpm --filter
- Using nx/turbo/whatever

### Vercel

The Geogenesis web app is hosted on Vercel. Check out the [live site here](https://geogenesis.vercel.app).

### CI/CD on Github Actions

[We run our CI/CD through Github actions](https://github.com/baiirun/geogenesis/actions).
