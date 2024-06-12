The API service returns data from our PostgreSQL database. Only the substream indexer can write to the DB

### Running the API

Provide the runtime environment with the keys from `.env.example`. If running locally create a `.env` file and update with the keys from `.env.example`.

```bash
# Run from within the root of the monorepo
pnpm install

# Run from within /packages/substream
pnpm build
pnpm start
```
