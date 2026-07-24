# v2 Contracts Cutover — Plan & Status

Branch: `mainnet-migration-v020` · Owner: Bryan Doss · Last updated: 2026-07-23

**Context.** The frontend was pinned to the testnet network identity in code
(hardcoded registry address, `GeoTestnetConfig` SDK client, `chainId: '55516'`
literal). The v2 contract cutover — and the eventual backend switch to mainnet —
require that network identity be pure configuration. A wrong registry address
fails **silently**: a tx to a codeless address succeeds with an empty receipt,
emits nothing, and never indexes. This plan restructures the app so both flips
are env changes, with fail-closed guards so a stale config can't fail silently
again.

We are staying on **testnet** for now. Phase 2 fires when backend cuts testnet
over to the v2 contract deployments; Phase 3 fires whenever mainnet happens.

---

## Phase 1 — Restructure: network identity → configuration ✅ DONE

Committed on this branch as `feat(config): env-driven network identity for v2
contract cutover`. Verified: `tsc --noEmit` clean, 1480/1480 tests pass, dev
server boots against staging testnet with no config errors.

- [x] **Single source of truth**: new `apps/web/core/sdk/geo-network.ts` builds
      `GEO_NETWORK` via `defineGeoNetworkConfig` from env (chain, RPC, API
      origin, sponsorship, contract addresses). Exports the registry/factory
      addresses everything else consumes.
- [x] **Env plumbing**: `NEXT_PUBLIC_CHAIN_ID` (validated, defaults `55516`),
      `NEXT_PUBLIC_SPACE_REGISTRY_ADDRESS`, `NEXT_PUBLIC_DAO_SPACE_FACTORY_ADDRESS`
      (format-validated; optional on testnet — SDK defaults apply — required on
      any other chain, build fails fast otherwise).
- [x] **SDK client** (`geo-client.ts`) built from `GEO_NETWORK` — this is what
      actually targets vote/execute, not the old constant.
- [x] **All hardcoded pins removed**: address constants out of
      `space-registry.ts`/`dao-space-factory.ts`; dead registry import in
      `use-vote.ts`; every `network: 'TESTNET'` literal (use-mutate ×3,
      generate-ops ×2, ranking, wallet.tsx, editor image/video nodes, CSV
      import, and the invisible default inside `personalSpace.createSpace()`).
- [x] **Uploads**: `createGeoImage` wrapper preserves the testnet
      alternative-IPFS-gateway behavior while taking the API origin from config.
- [x] **Wallet stack**: ZeroDev EIP-7702 is the only path, parameterized by
      `network`. Legacy v1 Safe+Pimlico stack deleted (it keyed permissions on
      the Safe address; the v2 registry keys on the Privy EOA).
- [x] **Fail-closed guards**: vote/execute assert registry bytecode before
      sending (`assertSpaceRegistryDeployed`, session-cached, fails open only on
      RPC errors); executability simulation returns `blocked` instead of a
      phantom `executable` when the target has no code.
- [x] **Local-anvil support removed** (2026-07-23): `apps/web/.env` anvil
      template deleted; `NEXT_PUBLIC_ZERODEV_RPC_URL_TESTNET`,
      `NEXT_PUBLIC_BUNDLER_RPC`, `NEXT_PUBLIC_PIMLICO_API_KEY` gone from code,
      env files, and CI; `AppConfig` reduced to `{chainId, rpc, api}`; chain
      `31337` dropped.
- [x] **Commit** — landed on the branch.
- [ ] **Push & PR** upstream when ready.
- [ ] Optional dep cleanup: `permissionless` + `@rhinestone/module-sdk` are now
      unused in `packages/auth/package.json` (removal touches the bun lockfile;
      fold into the next install churn).

## Phase 2 — v2 testnet cutover window ⏳ BLOCKED ON BACKEND INPUTS

The frontend action at the window is **setting env vars**, nothing else.

- [ ] Get the **new v2 testnet** `SPACE_REGISTRY_ADDRESS` +
      `DAO_SPACE_FACTORY_ADDRESS` from backend/infra.
- [ ] Set them via `NEXT_PUBLIC_SPACE_REGISTRY_ADDRESS` /
      `NEXT_PUBLIC_DAO_SPACE_FACTORY_ADDRESS` in the deploy environment (and
      `.env.local` for dev — placeholder lines already exist there).
      Alternatively bump `@geoprotocol/geo-sdk` if a release ships the new
      addresses (as of 2026-07-23, latest is `0.20.0-beta.8` with the old ones).
- [ ] Confirm whether the testnet API origin changes at cutover; update
      `NEXT_PUBLIC_API_ENDPOINT_TESTNET` if so.
- [ ] **Verify against the indexer, not the receipt**: cast a vote and execute a
      proposal on the new registry, confirm the events appear in the indexer. A
      successful receipt proves nothing here — a tx to the *old* registry also
      "succeeds". (The bytecode guard cannot catch old-vs-new registry on the
      same chain; the old contract still has code. See open ask #3.)
- [ ] Smoke: personal + DAO space create, image upload, edit publish, subspace
      action — each exercises a different formerly-pinned path.
- [ ] Grep gate stays clean: no `55516` literals, no `0x3642316...` /
      `0x322A3eD5...`, no `network: 'TESTNET'` outside `geo-network.ts` + tests.

## Phase 3 — Mainnet flip 🔮 FUTURE (should be zero code changes)

Env-only, if Phase 1 holds: `NEXT_PUBLIC_CHAIN_ID=80451` (or the real v2
mainnet chain id), `NEXT_PUBLIC_GEOGENESIS_RPC`, `NEXT_PUBLIC_API_ENDPOINT`,
both contract addresses, and the `packages/auth/src/chain.ts` mainnet entry
confirmed. Anything beyond env edits at this stage is a Phase 1 bug.

Known gap (deliberate): `GEO_NETWORK.sponsorship` is `undefined` off-testnet —
mainnet gas sponsorship needs an endpoint from infra before the flip (see asks).

## Open asks — backend/API/infra ❓ NOT YET SENT/ANSWERED

1. New **v2 testnet** registry + DAO factory addresses. Will a geo-sdk release
   ship them, or does the frontend own them via env permanently?
2. Does the testnet API origin change at the v2 cutover?
3. Can the API expose the active registry address (network-info endpoint)? That
   enables a runtime config-vs-backend consistency check — the only guard that
   catches "frontend pointed at the old registry" on the same chain.
4. Is the indexer pointed at the v2 registry and ready **before** the window
   opens? (Otherwise votes land on-chain but never render — indistinguishable
   from the silent-failure bug.)
5. For mainnet later: chain id (80451 or new? GEO native gas?), RPC, API origin,
   ZeroDev sponsorship endpoint.

## Team notes

- `apps/web/.env` (local-anvil template) is gone and unsupported. Anyone still
  carrying one locally should delete it; a stale copy would feed anvil contract
  addresses into the env-driven config (the bytecode guard will refuse to send,
  loudly, if that happens).
- `NEXT_PUBLIC_BUNDLER_RPC` / `NEXT_PUBLIC_PIMLICO_API_KEY` are no longer read —
  they can be deleted from Vercel/CI env whenever convenient (already removed
  from `.github/workflows/ci.yml` here).
- `packages/auth` consumers: `@geogenesis/auth/account` now exports only
  `generateZeroDevAccount({ signer, network })` + `GeoWalletClient`. The Safe
  `generateSmartAccount` is deleted.
