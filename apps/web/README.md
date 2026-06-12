### Getting started

```sh
# Run dev
bun dev

# Build web app
bun build

# Run production version of web app
bun build
bun start
```

### Ranking OG images

Ranking fullscreen share URLs can use precomputed R2-hosted images when these server env vars are set:

```sh
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
SOCIAL_PREVIEW_R2_BUCKET=
SOCIAL_PREVIEW_PUBLIC_BASE_URL=https://img.example.com
INTERNAL_API_SECRET=
```

Generated keys are immutable and variant-specific:

```txt
og/rankings/{rankEntityId}/{ogVersion}/landscape.png
og/rankings/{rankEntityId}/{ogVersion}/story.png
```

Metadata only points at the landscape variant after generation succeeds. The story variant is exported through the fullscreen share control for portrait-first surfaces.

`SOCIAL_PREVIEW_PUBLIC_BASE_URL` must be the public custom domain or public `r2.dev` URL for the bucket, not the `*.r2.cloudflarestorage.com` S3 API endpoint.

Backfill dry-run example:

```sh
bun apps/web/scripts/generate-ranking-og.ts --input ./rankings.json --dry-run
```
