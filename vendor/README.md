# vendor/

## `geoprotocol-geo-sdk-0.20.0-beta.9.tgz`

`@geoprotocol/geo-sdk@0.20.0-beta.9` on npm is a broken publish: the tarball
contains only `package.json` and `README.md`, with no `dist/`. Every entry in
that package's `exports` map points into `./dist/…`, so installing it from npm
breaks every SDK import in this repo.

We need that exact version. It carries the two changes the 2026-07-29 contract
redeploy requires ([geo-sdk#95]):

- `contracts.ts` points TESTNET at the live registry
  (`0xCF13491802747e759e1BB8E364bc43045398d1DD`) and factory
  (`0x323aF429B85c954D4a161b2A6281c26DF45b7128`). The addresses baked into
  beta.8 are an abandoned deployment that still has live bytecode, so writes
  against it succeed and are never indexed.
- `Action` gains a `bytes16 toSpaceId` field, and DAO proposals now target
  `toAddress: 0x0` + `toSpaceId`. The redeployed `DAOSpace` decodes the 4-field
  tuple; the 3-field encoding from beta.8 word-shifts into a malformed action.
  FAST proposals revert at creation, and SLOW proposals are created and then
  permanently unexecutable.

Pointing a dependency at the commit directly does not work — the repo has no
`prepare`/`prepack` hook and declares `files: ["dist"]`, so a git install
fetches source only and leaves `dist/` missing, exactly like the npm tarball.

So this is the release built from source and packed:

```
commit  c75a38ed31f072ded40a2c72553cb917723853c0   ("Bump version", geobrowser/geo-sdk main)
build   pnpm build (tsc) -> 696 files in dist/, exit 0
pack    npm pack -> 698 files
sha256  79783a44d1b88f0c3dfdd321cf44017ed664ee8cf324b3611996577ef56acc29
```

Wired in through the root `overrides` block rather than the workspace dependency
specs, so the three `package.json` files keep naming the version they actually
want and one entry redirects resolution. `dist/` is prebuilt, so nothing runs at
install time and this needs no `trustedDependencies` — Bun refuses lifecycle
scripts for non-npm sources by default, which is why a fork-plus-`prepare`
approach would fail on CI and Vercel.

## Removing this

Once a fixed release is on npm (it cannot be `0.20.0-beta.9` — npm will not
replace a published version, so it will be `beta.10` or later):

1. Delete the `@geoprotocol/geo-sdk` entry from `overrides` in the root
   `package.json`.
2. Bump the spec in `package.json`, `apps/web/package.json`, and
   `packages/auth/package.json`.
3. Delete this directory.
4. `bun install` and confirm `node_modules/@geoprotocol/geo-sdk/dist` exists —
   an empty publish is silent at install time and only shows up as unresolvable
   imports.

[geo-sdk#95]: https://github.com/geobrowser/geo-sdk/pull/95
