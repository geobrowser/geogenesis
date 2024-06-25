### Getting started

```sh
# Run dev
pnpm dev

# Build web app
pnpm build

# Run production version of web app
pnpm build
pnpm start
```

### Environment variables

The frontend relies on [Liveblocks](https://liveblocks.io) for a frontend-specific feature that shows which users are currently editing a given entity. To use this feature you need to have a Liveblocks API key configured and in your `.env.local` file.

Additionally, WalletConnect v2 requires a project id.

```bash
# .env.local
NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY=
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
ENV_URL=
NEXT_PUBLIC_IPFS_GATEWAY_PATH=
NEXT_PUBLIC_PRIVY_APP_ID=
```
