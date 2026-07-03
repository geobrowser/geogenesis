# v0.20 SDK Migration — Working Log

Branch: `mainnet-migration-v020`
Base: `upstream/master` (commit `46ee68b68`)
Goal: upgrade `@geoprotocol/geo-sdk` to `0.20.0-beta.1` and add local-dev support so we can run the app against the `geo-migration-e2e` stack.

Everything in this log is **uncommitted on the working branch** — nothing has been pushed.

---

## Phase 0 — Branch reset (context)

The original `mainnet-migration-v020` had 35 commits ahead of master, but `git log --cherry-pick` revealed all but one (`feat: assistant inject #1814`) already existed on master via backport PRs. That one was also subsequently superseded by `aa206a38c` on master plus follow-ups (`b8df712a4`, `ed857e7d0`). So the branch was hard-reset to `upstream/master` — backup branches `mainnet-migration-v020-backup-*` were created beforehand.

Net effect: branch tip == master tip, with the work below applied uncommitted on top.

---

## Phase 1 — SDK version bump

**Why:** Upgrade to the v0.20 line for contracts v2 migration.

| File | Change |
|---|---|
| `package.json` | `@geoprotocol/geo-sdk: ^0.19.1` → `^0.20.0-beta.1` |
| `apps/web/package.json` | `@geoprotocol/geo-sdk: ^0.19.1` → `^0.20.0-beta.1` (kept `@geoprotocol/grc-20: ^0.4.1`) |
| `bun.lock` | Regenerated. Resolved to `0.20.0-beta.1`. |

`0.20.0-beta.1` is the latest beta. There is no stable 0.20 release yet; `latest` dist-tag is still on `0.19.2`.

---

## Phase 2 — Local-dev wallet path (port from `geo-migration-e2e/geobrowser`)

**Why:** The backend devs' `geo-migration-e2e` stack runs a full v2 chain + indexer + GraphQL API locally. Their test geobrowser branch (`feat/local-chain-support`) bypasses Privy + smart-wallet bundling and signs directly from an injected wallet (MetaMask) against the local Anvil chain. We need the same escape hatch to test against contracts v2 before mainnet.

Their branch patched `@geoprotocol/geo-sdk@0.18.0` (`patches/@geoprotocol%2Fgeo-sdk@0.18.0.patch`) to override hardcoded `TESTNET` contract addresses and the API origin from env vars. **In v0.20 this is no longer needed** — the SDK exports `defineGeoNetworkConfig({ id, name, apiOrigin, chain, contracts })` as a first-class extension point. So we use that instead of carrying a patch.

### Files changed

| File | Change | Why |
|---|---|---|
| `packages/auth/src/chain.ts` | Added `LOCAL` to `GeoNetwork` union. Refactored to `CHAIN_IDS`/`DEFAULT_RPC_URLS` const maps. `LOCAL` defaults to chain id 1337 (matches test geobrowser branch). | We need a third network identifier so wallet config and SDK config can both target a local chain distinctly. Test repo used 1337; the e2e stack's docker-compose defaults `CHAIN_ID=19411` but the test branch's `LOCAL_CHAIN_ID = 1337` enforced a switch. We follow the test branch and document the env override (`NEXT_PUBLIC_LOCAL_CHAIN_ID`). |
| `packages/auth/src/wallet-config.ts` | Added `createLocalDevConfig({ chain, rpcUrl })` using vanilla `wagmi.createConfig` (not `@privy-io/wagmi`'s). Single `injected({ target: windowProvider })` connector with `multiInjectedProviderDiscovery: true`. | The Privy `createConfig` requires a Privy context above it (`useWallets` crashes without `PrivyProvider`). In local-dev we don't mount Privy at all, so the wagmi config has to be the vanilla flavor. |
| `packages/auth/wallet.ts` | Re-export `createLocalDevConfig`. | Public API surface. |
| `apps/web/core/environment/config.ts` | Added `IS_LOCAL_DEV`, `LOCAL_CHAIN_ID`, `LOCAL_SPACE_REGISTRY_ADDRESS`, `LOCAL_DAO_SPACE_FACTORY_ADDRESS`. Validators only fire when `IS_LOCAL_DEV=true` so testnet/mainnet builds still work without these vars. | Need env hooks for local addresses; can't validate them unconditionally because they're not set in real envs. |
| `apps/web/core/environment/environment.ts` | Exposed `variables.isLocalDev`, `variables.localChainId`, `variables.localContracts`. `getConfig()` returns the local chain id when `isLocalDev`. Added `'1337'` to `SupportedChainId` union. | Downstream code reads `Environment.variables.isLocalDev` to branch behavior. |
| `apps/web/core/wallet/geo-chain.ts` | `networkForChain()` returns `LOCAL` first when `isLocalDev`, then `TESTNET`/`MAINNET` by chainId. Passes through `config.rpc`. | Routes the right network to `getGeoChain()` and uses the configured RPC URL (localhost when local-dev). |
| `apps/web/core/wallet/wallet.tsx` | `WalletProvider` mounts `wagmi`'s `WagmiProvider` (not Privy's) when `isLocalDev`. New `LocalDevConnectButton` does EIP-6963 wallet priority (`io.metamask` → `io.rabby` → other injected → `windowProvider` fallback) and force-switches chain on mismatch. `GeoConnectButton` routes to local or Privy variant. | Privy's `WagmiProvider` calls `useWallets` internally and crashes if `PrivyProvider` isn't mounted above it. Wallet-extension priority matters because picking `windowProvider` first picks whichever extension last wrote `window.ethereum`, which is wrong when users have multiple wallets installed. |
| `apps/web/partials/navbar/navbar-actions.tsx` | `NavbarActionsLocal` uses only `useAccount`/`useDisconnect`/`useSpaceId`. No smart account, no profile lookup, no personal-space link. `NavbarActions` routes to local or Privy variant. | The Privy navbar pulls in `useSmartAccount` + `useGeoProfile` + `useLogout` which all assume Privy is mounted. Local-dev has none of that — the user is just a connected EOA. |
| `apps/web/core/sdk/geo-client.ts` | When `isLocalDev`, build the SDK network config via `defineGeoNetworkConfig({ id: 'LOCAL', name, apiOrigin, chain, contracts })` from env vars. Otherwise keep `GeoTestnetConfig`. | This is the v0.20-native replacement for the test repo's geo-sdk patch. The SDK uses the `contracts.SPACE_REGISTRY_ADDRESS` and `contracts.DAO_SPACE_FACTORY_ADDRESS` from this config for calldata generation, and the `apiOrigin` for IPFS / GraphQL helpers. |

### Build/typecheck status after phase 2

- `bun run build` in `packages/auth` — clean.
- `tsc --noEmit` in `apps/web` — clean for all files touched in this port. **5 errors remain in untouched files** (Phase 3 below).

---

## Phase 3 — v0.20 API break fixes ✅

**Why:** `tsc --noEmit` surfaced 5 pre-existing errors in master that block running the app. None were introduced by the Phase 2 port — they're real v0.19→v0.20 SDK breaks. Needed to fix them to get edit mode working end-to-end.

### Fixes applied

| Error | File | Resolution | Why |
|---|---|---|---|
| `slowPathPercentageThreshold` does not exist on voting settings | `apps/web/core/hooks/use-deploy-space.ts:212` | Renamed `slowPathPercentageThreshold` → `partialPercentageSupportThreshold`, `fastPathFlatThreshold` → `flatSupportThreshold`. Added 3 new required fields: `universalPercentageSupportThreshold: 90`, `disableFastPathAccessForNewMembers: true`, `executionGracePeriodInDays: 14` (SDK defaults). Removed the TODO(GEO-2120/2105) comment that anticipated this exact rename. | `VotingSettingsInputBase` in v0.20 has 6 mandatory fields (plus duration) where v0.18 had only 3 fields. The TODO in the existing code literally said "when SDK 0.20.x ships, rename to the 7-field VotingSettingsInput (partialPercentageSupportThreshold, etc.)" — we're doing exactly that. Preserved existing values for fields that existed (`51%` partial threshold, `0` flat threshold, `1` quorum, `NEW_SPACE_VOTING_DURATION_DAYS` duration). New fields use SDK defaults. |
| `slowPathPercentageThreshold` does not exist on `votingSettings` from ABI | `apps/web/app/space/[id]/(space)/governance/page.tsx:121` | Renamed `votingSettings.slowPathPercentageThreshold` → `votingSettings.partialPercentageSupportThreshold`. | This reads voting settings from a contract via `DaoSpaceAbi.votingSettings()`. The contract field was renamed in v2 contracts; the v0.20 ABI's `VotingSettings` interface now exposes `partialPercentageSupportThreshold`. The data semantics are unchanged — it's still the "% support needed for slow-path execution". |
| `proposals` namespace does not exist on `geo.daoSpaces` | `apps/web/core/hooks/use-vote.ts:57` | `geo.daoSpaces.proposals.vote(...)` → `geo.daoSpaces.voteProposal(...)`. | The `proposals` sub-namespace was flattened in v0.20 — `voteProposal` and `executeProposal` are now direct methods on `daoSpaces`. Inspected the v0.20 implementation: both still return `{ to: SPACE_REGISTRY_ADDRESS, calldata }`, and the hooks already pin `to` via `useSmartAccountTransaction({ address: SPACE_REGISTRY_ADDRESS })`, so the destination contract is unchanged. Pure rename. |
| Same as above | `apps/web/core/hooks/use-execute-proposal.ts:55` | `geo.daoSpaces.proposals.execute(...)` → `geo.daoSpaces.executeProposal(...)`. | Same as `use-vote.ts`. |
| `'RELATION'` not assignable to `RenderableType` | `apps/web/core/chat/write-validators.test.ts:559` | Changed test fixture's `renderableTypeStrict: 'RELATION'` → `renderableTypeStrict: 'VIDEO'`. | `RenderableType` is `'IMAGE' \| 'VIDEO' \| 'URL' \| 'GEO_LOCATION' \| 'PLACE' \| 'ADDRESS'` — `'RELATION'` was never valid. The test's intent is "renderableTypeStrict is set to something other than IMAGE → wrong_type rejection". `'VIDEO'` preserves that intent with a real valid `RenderableType`. The original `'RELATION'` was probably accepted in v0.19 due to type widening that v0.20 tightens. |

### Typecheck status after Phase 3

`tsc --noEmit` in `apps/web/` — **0 errors**. ✅

---

## Phase 3.5 — Local-dev runtime fix: useSmartAccount polyfill

**Why:** User reported "app runs but can't enter edit mode" with a GraphQL error referencing an empty `objectId`. Root cause: in local-dev mode `useSmartAccount` was returning `null` because it was calling `generateSmartAccount({ bundlerUrl: localhost:8545?apikey=1234, ... })` against a non-existent Pimlico bundler. With no smart account, `usePersonalSpaceId` returns null, which makes `useAccessControl.canEdit` permanently false, which means the edit-mode toggle just shakes.

| File | Change | Why |
|---|---|---|
| `apps/web/core/hooks/use-smart-account.ts` | When `Environment.variables.isLocalDev`, skip the bundler/permissionless path entirely and return an EOA-backed pseudo-smart-account built from wagmi's `walletClient`. Exposes `account`, `sendTransaction({ to, data, value })`, and `sendUserOperation({ calls })`. Multi-call user ops log a warning and submit only the first call (EOAs can't batch). Sets the wallet cookie with the EOA address. | The e2e stack has no Pimlico endpoint. We need `.account.address` populated so all the downstream identity checks work, and we need a real `sendTransaction`/`sendUserOperation` so edit/vote/execute paths can sign through the connected EOA. |
| `apps/web/core/hooks/use-personal-space-id.ts` | Added a `console.log('[local-dev] getSpaceByAddress', { address, space })` after the GraphQL call when `isLocalDev`. | Diagnostic. Lets us see in the browser console whether the indexer has a personal space registered for the connected wallet. |

### Known limitations of the polyfill

- **`sendUserOperation` with multi-call batches**: EOAs can't atomically execute multiple calls; the polyfill submits only the first. Real ERC-4337 smart accounts batch them into one transaction. If a flow depends on batched atomicity (e.g. publish-edit + register-personal-space in one bundle), it will partially succeed in local-dev. This is acceptable for local testing; the upstream path on testnet/mainnet is unaffected.
- **No counterfactual deployment**: ERC-4337 smart accounts have an address before any tx happens (computed from factory + salt). EOAs are address-as-private-key. So the address the user sees in local-dev (= their MetaMask EOA) is *different* from what they'd see on testnet/mainnet (= a smart wallet derived from Privy). This means personal-space registration in local-dev has to use the EOA address, not the smart-wallet address.
- **No bundler fee abstraction**: All gas comes out of the EOA in local-dev. The e2e stack pre-funds dev accounts with 10,000 ETH, so this isn't a problem.

---

## Phase 3.6 — Route SDK helpers through `geo` client (the testnet-origin bug)

**Why:** User reported `POST https://testnet-api.geobrowser.io/ipfs/upload-edit` firing during a personal-space publish in local-dev mode — should have been hitting their local API. Root cause: 7 call sites use the legacy `personalSpace.publishEdit`, `daoSpace.proposeEdit`, and `Ipfs.publishEdit` helpers from `@geoprotocol/geo-sdk` with `network: 'TESTNET'` hardcoded. Those legacy helpers resolve a default testnet `apiOrigin` internally and never consult our `defineGeoNetworkConfig`-built client. The `geo.{personalSpaces,daoSpaces}.*` client methods read `apiOrigin` from the configured `network` instead, so routing through `geo` picks up our local origin automatically.

| Call site | From | To | Notes |
|---|---|---|---|
| `apps/web/core/hooks/use-publish.ts:341` | `daoSpace.proposeEdit({…, network: 'TESTNET'})` | `geo.daoSpaces.proposeEdit({…})` | Personal-space + DAO publish flow. This is the call that fired during the user-reported repro. |
| `apps/web/core/hooks/use-publish.ts:375` | `personalSpace.publishEdit({…, network: 'TESTNET'})` | `geo.personalSpaces.publishEdit({…})` | Same flow, personal-space branch. |
| `apps/web/core/hooks/use-create-personal-space.ts:77` | `personalSpace.publishEdit({…, network: 'TESTNET'})` | `geo.personalSpaces.publishEdit({…})` | Onboarding / first-time space registration. |
| `apps/web/core/hooks/use-deploy-space.ts:159` | `Ipfs.publishEdit({…, network: 'TESTNET'})` | `geo.personalSpaces.publishEdit({…, spaceId: personalSpaceId})` | We only need `cid` for downstream `getCreateDaoSpaceCalldata`. The IPFS binary contains only `name/ops/author` (no `spaceId`), so the cid from `personalSpaces.publishEdit` is reusable. The `to`/`calldata` it returns are for pushing the edit to the personal space; we discard them. |
| `apps/web/core/hooks/use-deploy-space.ts:332` | `personalSpace.publishEdit({…, network: 'TESTNET'})` | `geo.personalSpaces.publishEdit({…})` | Same DAO-creation flow, later step. |
| `apps/web/core/hooks/use-create-comment.tsx:313` | `personalSpace.publishEdit({…, network: 'TESTNET'})` | `geo.personalSpaces.publishEdit({…})` | Comment-creation publish. |
| `apps/web/core/hooks/use-create-comment.tsx:541` | `personalSpace.publishEdit({…, network: 'TESTNET'})` | `geo.personalSpaces.publishEdit({…})` | Comment-edit publish. |

### Secondary fix — `personalSpace.createSpace()` (different method)

`personalSpace.createSpace()` is a nullary helper that just returns `{to, calldata}` for the empty personal-space registration tx. In v0.20 the equivalent client method, `geo.personalSpaces.create({name, accountAddress})`, additionally generates space-entity ops — but the calling code generates those separately via `generateOpsForSpaceType` and bundles them into a follow-up `publishEdit`. So switching to `geo.personalSpaces.create` would double-create the entity ops. Minimal fix: use `getCreatePersonalSpaceCalldata()` (a root SDK export — still works) and read the registry address from `geo.network.contracts.SPACE_REGISTRY_ADDRESS` instead of a hardcoded constant.

| Call site | Change |
|---|---|
| `apps/web/core/hooks/use-create-personal-space.ts:38` | `personalSpace.createSpace()` → read `registryTo = geo.network.contracts?.SPACE_REGISTRY_ADDRESS`, `registryCalldata = getCreatePersonalSpaceCalldata()`. |
| `apps/web/core/hooks/use-deploy-space.ts:299` | Same fix. |

Both throw a clear error if the network config is missing the registry address, surfacing local-dev env-var omissions early.

### Typecheck status after Phase 3.6

`tsc --noEmit` — **0 errors**. ✅

### Open follow-up: the `SPACE_REGISTRY_ADDRESS` hardcoded constant

`apps/web/core/utils/contracts/space-registry.ts:8` still has a hardcoded `SPACE_REGISTRY_ADDRESS = '0xB016…'` (the testnet address) consumed by several other paths (vote, execute, etc. via `SPACE_REGISTRY_ADDRESS_HEX`). In local-dev these will write to the wrong contract. Per the test repo's geo-sdk patch, this was patched at the SDK level — but for us, the right v0.20 answer is the same as above: read from `geo.network.contracts.SPACE_REGISTRY_ADDRESS`. Logged here so it's not lost; not yet migrated. Same applies to `DAO_SPACE_FACTORY_ADDRESS` if there's a similar hardcoded constant.

---

## Phase 3.7 — Search rejects `additional_space_ids` on local API

**Why:** User got `FiberFailure: Error: Unrecognized query parameter(s): additional_space_ids` from the local search endpoint. The local API exposes a narrower param set (`query, q, scope, space_id, type_ids, exclude_type_ids, limit, offset, include_deleted, include_non_canonical, score_boost, …`) and rejects unknown params strictly. Testnet's API accepts the broader set.

| File | Change |
|---|---|
| `apps/web/core/io/queries.ts` (`buildSearchPath`) | Skip `additional_space_ids` when `Environment.variables.isLocalDev` is true. On testnet/mainnet the param still flows through unchanged. |
| Same file | Added `Environment` import (already had `getConfig` from the same module — just adding the namespace import alongside). |

This is a server-capability gap, not a code bug. Logged so the backend devs know to add the param to the local API if/when search needs it locally. For now the local search simply doesn't filter by `additional_space_ids`.

---

## Phase 3.8 — Editing the personal space home page

**Why:** User can publish edits on entities *inside* their personal space but not on the space's home page itself. Root cause: the e2e indexer returns the personal space with `entity.id = ""` because the bootstrap registers personal spaces directly (skipping `personalSpaces.create`, which would have generated a `spaceEntityId`). The editor inherits that empty id, every value gets stored with `entity.id = ""`, and the publish-prep filter (correctly) rejects them.

The space-page layout has a `getSpaceFrontPage` helper with a fallback for `!entity` that does `id: IdUtils.generate()`. But that fallback (a) never fired here because `entity` was truthy with just an empty id, and (b) would have generated a fresh non-deterministic id on every render anyway — values written in one session would orphan on refresh.

| File | Change |
|---|---|
| `apps/web/app/space/[id]/(space)/layout.tsx` (`getSpaceFrontPage`) | Added a second branch `if (!entity.id)` that returns `id: spaceId`. Deterministic, stable across renders, lets the editor and publish flow agree on a single id. The space is otherwise passed through unchanged so the rest of the page renders normally. |
| `apps/web/app/space/[id]/(space)/page.tsx` (`getSpaceFrontPage`) | Same shape, slightly different return type. `id = entity.id || space?.id ?? ''` for the same reason. |

### Caveat — this is a local-dev workaround, not a real fix

In v2 a space and its home entity have distinct UUIDs (`spaceId !== spaceEntityId`). Reusing `spaceId` as the entity id is fine for local testing but if the backend bootstrap is fixed and a real `spaceEntityId` shows up later, *any edits made under the spaceId-as-entityId convention will not migrate automatically* — the published values will be associated with `entity.id == spaceId` rather than the proper `entity.id == spaceEntityId`. Two ways out:
1. Backend fix: the e2e seed script should register personal spaces via `geo.personalSpaces.create({ name, accountAddress })` so the indexer records a real `spaceEntityId`. Right answer.
2. If we ever want to harden this client side, the editor would need a mapping `{spaceId → mintedEntityId}` persisted in localStorage and a separate publish flow that emits an entity-creation op so the indexer adopts the minted id. Out of scope for this branch.

The condition `!entity.id` is structural, not gated on `isLocalDev`, because the symptom (empty entity id from indexer) is what we care about — if testnet ever served the same broken shape, the same fallback would do the right thing.

---

## Phase 3.9 — Surface published values on the personal-space page + relax search filter

After Phase 3.8 we could publish edits on the home page, but the page didn't reflect them and search returned no UI results. Both have the same root: the indexer's space record still has `entity.id = ""`, so reads of `space.entity` return empty even after publish. We're publishing to entity-id = spaceId (our synthetic id), but the layout SSR + search post-processing keep reading the (empty) space.entity slot.

### Fix 1 — Layout fetches the entity at id=spaceId when the space's home entity is empty

| File | Change |
|---|---|
| `apps/web/app/space/[id]/(space)/layout.tsx` (`getSpaceFrontPage`) | In the `!entity.id` branch, fetch `cachedFetchEntityPage(spaceId, spaceId)` and merge its `values`, `relations`, `name`, etc. into the returned `space` object. `avatarUrl` and `coverUrl` are also resolved from the fetched entity's relations. So SSR finds whatever we published under `entity-id = spaceId` and renders it as the space's home content. |
| `apps/web/app/space/[id]/(space)/page.tsx` (`getSpaceFrontPage`) | Same pattern — when `!entity.id`, fetch the entity at `id = space.id` and use its values/name/types/relations instead of the empty `space.entity`. |

Together these two changes make a published Name/Description/cover/etc. on the personal-space home page actually appear after refresh.

### Fix 2 — Search filter relaxation in local-dev

`findFuzzyPage` in `apps/web/core/sync/orm.ts` post-processes search results by resolving each result's host spaces to `SpaceEntity` shape, then filtering out spaces where the space's home entity has no name (`hasName(s.name)`). That filter then cascades into `isIncludedSearchResult` which requires `spaces.length > 0`, so a result whose only host space looks "unnamed" disappears from the UI.

On the local e2e stack, every personal space the bootstrap creates has `entity.id = ""` and therefore `entity.name = null`. So *every* result hosted in a user's personal space gets filtered out — even when the result itself is named and indexed correctly.

| File | Change |
|---|---|
| `apps/web/core/sync/orm.ts` (`findFuzzyPage`, around line 510) | Skip the `hasName(s.name)` space filter when `Environment.variables.isLocalDev`. Testnet/mainnet behavior unchanged. Added `Environment` import. |

The result still goes through `isIncludedSearchResult`, but with the host space included, `spaces.length > 0` passes. The result's own name still has to be truthy to surface, which is fine — we don't want to surface unnamed entities even locally.

### Out of scope / open

- The indexer's space record is still wrong (`entity.id = ""`). The right fix is the e2e bootstrap calling `geo.personalSpaces.create({name, accountAddress})` so the indexer records a real `spaceEntityId`. Until then, our workarounds make the app usable for local testing but produce data that won't migrate cleanly if the bootstrap is fixed later (edits stick to `entity.id = spaceId` rather than the eventual real `spaceEntityId`).
- For results from spaces with no name, the resolved space name in `SearchResultRow` will still be null. UI may render as "Untitled" or whatever the unnamed-space fallback is. Acceptable for local testing.

---

## Phase 3.10 — System property fallback stubs

**Why:** Even after the OpenSearch backfill, clicking the "+ type" placeholder in the entity header silently did nothing. Traced to `RelationsGroup` (apps/web/partials/entity-page/editable-entity-page.tsx:485-487): if `useQueryProperty({ id: propertyId })` returns `null`, the whole component returns `null`. And the GraphQL `property(id: TYPES_PROPERTY)` call returned `null` because the local e2e stack's `init-bootstrap-properties` script only registers `Name` and `Description` properties (and even those land with `dataTypeId: null`). `Types`, `Properties`, etc. are absent from the backend's property table entirely.

This is a backend bootstrap gap. The right long-term fix is widening the e2e bootstrap (see "Open" below). For now, added a local-dev frontend fallback so the UI doesn't silently break when the table is incomplete.

| File | Change |
|---|---|
| `apps/web/partials/entity-page/editable-entity-page.tsx` | Added a `SYSTEM_PROPERTY_FALLBACKS: Record<string, Property>` map at module scope covering `TYPES_PROPERTY` (relationValueTypes → `SCHEMA_TYPE`) and `PROPERTIES` (relationValueTypes → `PROPERTY`). In `RelationsGroup`, when `useQueryProperty(...)` returns `null` AND `isLocalDev`, fall back to the stub for the requested propertyId. Lets the "+ type" header placeholder render the SelectEntity picker with the right `relationValueTypes`, so users can find and add a type. Added `Environment` import. Testnet/mainnet behavior unchanged. |

### Caveats

- Stubs lack `renderableType`, `format`, `unit`, etc. Behaves correctly for the common picker flow; some richer pickers might render slightly degraded. Acceptable for local testing.
- Only `TYPES_PROPERTY` and `PROPERTIES` are stubbed. If you hit another silent-no-render in `RelationsGroup` for a different system property, add it to the map.
- The Phase 3.6 swap of `personalSpace.createSpace()` for `getCreatePersonalSpaceCalldata()` + `geo.network.contracts.SPACE_REGISTRY_ADDRESS` means the SDK is using your local registry contract, but the e2e bootstrap script still only seeds NAME/DESCRIPTION on its own. Re-running `just init-bootstrap-properties` reissues the same two properties — it doesn't help with Types.

### Open backend gap to flag to the migration team

The e2e bootstrap pipeline currently only registers `Name` and `Description` in the property table, and without `dataTypeId`. Several core system properties — `Types`, `Properties`, `Cover`, `Tabs`, etc. — are not registered at all. Geobrowser's editor and entity-page UI depend on `getProperty(...)` returning fully-formed `PropertyInfo` rows for all system properties. Either:

- The e2e bootstrap should call `bootstrap-properties` (or an extended version) covering every SystemId in `@geoprotocol/geo-sdk`'s `system.js`, with each property's `dataTypeId` set, OR
- The genesis contract deployment should pre-seed these into Postgres so they're available out of the box.

This blocks anything that drives UI off `useQueryProperty` for system propertyIds, not just the "+ type" picker.

---

## Phase 3.11 — Review-edits screen shows spaceId instead of space name

**Why:** The review-edits modal renders `activeSpaceMetadata?.entity.name ?? activeSpace` (review-changes.tsx:746,763). For the user's personal space, `entity.name` is null (the indexer's space record has no home entity, same Phase 3.8/3.9 root cause), so the modal falls back to displaying the raw spaceId. Phase 3.9's synthetic-home merge only covered the SSR layout — the review screen runs client-side via `getSpaces({ spaceIds })` and was unpatched.

| File | Change |
|---|---|
| `apps/web/partials/review/review-changes.tsx` | In the `fetchSpaces` effect that powers the modal's `spaces` state, when `isLocalDev` and the returned spaces include any with an empty `entity.id`, batch-fetch the entities at `id = spaceId` via `getBatchEntities` and merge `name`/`description`/`values`/`relations`/`types` into each affected space before calling `setSpaces`. Added `Environment` import and pulled `getBatchEntities` into the existing `~/core/io/queries` import. |

### Caveats

- Adds one extra GraphQL roundtrip per review-open when local-dev spaces are involved. Negligible.
- If a space has an empty home entity AND no synthetic entity has been published at id=spaceId yet, the fallback gracefully passes through and the modal still falls back to showing the spaceId (same as before). Once the user publishes any name edit it'll start rendering correctly.
- Testnet/mainnet are untouched (gated by `Environment.variables.isLocalDev`).

### Open backend pattern to flag

Every place that reads `space.entity.name` for display is liable to fall back to the spaceId on local-dev (browse sidebar, search result rows, navbar breadcrumbs, etc.). Long-term right answer is the same as Phase 3.8/3.9/3.10: fix the e2e bootstrap so personal spaces get a proper `spaceEntityId`. Until then, expect to add similar synthetic-home merges if the user hits the same symptom elsewhere.

---

## Phase 3.12 — Votes weren't being recorded + full SDK governance migration

### The vote bug

User reported MetaMask confirmations followed by votes never appearing after refresh. Root cause: `useVote` and `useExecuteProposal` (and 6 other governance hooks) called `useSmartAccountTransaction({ address: SPACE_REGISTRY_ADDRESS })` where `SPACE_REGISTRY_ADDRESS` was a hardcoded testnet constant `0xB01683…`. On the local Anvil chain that address has no contract, so the tx succeeded as a plain value transfer and no event ever fired — indexer saw nothing.

### Two parallel fixes

**Fix A (defense in depth):** make the address constants resolve dynamically at module-load time.

| File | Change |
|---|---|
| `apps/web/core/utils/contracts/space-registry.ts` | `SPACE_REGISTRY_ADDRESS` and `SPACE_REGISTRY_ADDRESS_HEX` now resolve via `Environment.variables.localContracts.spaceRegistry` when `isLocalDev`. Falls back to the original `0xB01683…` constant on testnet. All 8 hooks that imported the constant automatically get the right address. |
| `apps/web/core/utils/contracts/dao-space-factory.ts` | Same pattern for `DAO_SPACE_FACTORY_ADDRESS` (was `0x19f56F9…`, now reads `Environment.variables.localContracts.daoSpaceFactory` in local-dev). |

**Fix B (cleaner long-term):** migrate every hand-rolled governance hook to call `geo.daoSpaces.*` / `geo.personalSpaces.*` and use the SDK's returned `to` field. SDK is the source of truth for contract addresses; the dynamic constants become belt-and-suspenders.

### useSmartAccountTransaction API change

`useSmartAccountTransaction` previously pinned the `to` address at hook setup. Refactored so it takes `{to, data, value?}` per call:

```ts
// Before
const tx = useSmartAccountTransaction({ address: SPACE_REGISTRY_ADDRESS });
const txEffect = tx(calldata);

// After
const tx = useSmartAccountTransaction();
const { to, calldata } = geo.daoSpaces.someAction({...});
const txEffect = tx({ to, data: calldata });
```

This lets every consumer forward the `to` the SDK already returns rather than pinning a constant.

### Hooks migrated to the SDK

| Hook | Before (hand-rolled) | After (SDK) |
|---|---|---|
| `use-vote.ts` | `geo.daoSpaces.voteProposal` but discarded `result.to` | uses `result.to` |
| `use-execute-proposal.ts` | same | same |
| `use-propose-add-editor.ts` | `encodeFunctionData(addEditor) + encodeProposalCreatedData(SLOW) + encode(enter())` | `geo.daoSpaces.proposeAddEditor({authorSpaceId, spaceId, daoSpaceAddress, newEditorSpaceId})` |
| `use-propose-remove-editor.ts` | same hand-rolled chain | `geo.daoSpaces.proposeRemoveEditor({…, editorToRemoveSpaceId})` |
| `use-request-to-be-editor.ts` | hand-rolled `addEditor(self)` proposal | `geo.daoSpaces.proposeAddEditor({…, newEditorSpaceId: personalSpaceId})` |
| `use-propose-add-member.ts` | hand-rolled `addMember` proposal | `geo.daoSpaces.proposeAddMember({…, newMemberSpaceId, votingMode})` |
| `use-propose-remove-member.ts` | hand-rolled `removeMember` proposal | `geo.daoSpaces.proposeRemoveMember({…, memberToRemoveSpaceId, votingMode})` |
| `use-request-to-be-member.ts` | hand-rolled `MEMBERSHIP_REQUESTED` action | `geo.daoSpaces.proposeRequestMembership({authorSpaceId, spaceId})` |
| `use-create-personal-space.ts` | hand-rolled `buildPersonalTopicDeclaredCalldata` + `to: SPACE_REGISTRY_ADDRESS_HEX` | `geo.personalSpaces.setTopic({authorSpaceId, spaceId, topicId})` returning `{to, calldata}` |

### Net deletion

About **600 lines of hand-rolled `encodeFunctionData(...) + ABI + governance action constants` collapse to single `geo.daoSpaces.X(...)` calls.** `buildPersonalTopicDeclaredCalldata` is now only referenced from its own tests (dead code — could be deleted in a cleanup PR).

### Not migrated (no SDK equivalent)

- `use-subspace.ts` — handles 3 relation types (verified / related / subtopic) × 2 directions (set / unset) × 2 space types (DAO / personal) = 12 variants. SDK exposes lower-level primitives (`getAcceptSubspaceArguments`, `getRemoveSubspaceArguments`) but no high-level method for the full matrix. Functionally unblocked by Fix A's dynamic `SPACE_REGISTRY_ADDRESS` constant.
- The contract reads in `use-deploy-space.ts` (`readContract({address: DAO_SPACE_FACTORY_ADDRESS, abi, functionName: 'spaceRegistry'})`) — these aren't SDK-replaceable since the SDK doesn't expose a "read contract" wrapper. Fix A's dynamic constant handles them.

### Typecheck status after Phase 3.12

`tsc --noEmit` — **0 errors**. ✅

### Phase 3.12 followup — three hooks I missed on the first sweep

User reported `Missing transaction target` when entity-voting. The Phase 3.12 sweep updated all the *governance proposal* hooks but missed the entity-vote and space-topic ones, which were still calling `useSmartAccountTransaction({ address: SPACE_REGISTRY_ADDRESS })` against the new 0-arg API. The string-shaped `callData` was being passed through to `tx(callData)` which expected `{to, data}`, so `to` was `undefined` → "Missing transaction target".

Caveat to flag: TypeScript didn't surface the API mismatch even though the function is declared with zero params — extra args were being silently ignored. Worth a stricter signature on `useSmartAccountTransaction` in a follow-up so this fails at compile time. For now, fixed the call sites directly:

| Hook | Change |
|---|---|
| `use-entity-vote.ts` | Migrated entirely to the SDK: `geo.entityVotes.upvote/downvote/withdraw({authorSpaceId, spaceId, entityId})`. Removed the hand-rolled `encodeEntityVoteTopic`/`encodeEntityVoteData` + `SpaceRegistry.enter()` encoding. Picks the SDK method by direction. |
| `use-space-topic.ts` | Personal-space branch uses `geo.personalSpaces.setTopic(...)` for `{to, calldata}`. DAO branch keeps the hand-rolled `buildDaoTopicDeclaredCalldata` because no SDK helper exists for that custom governance action; the `to` is sourced from `SPACE_REGISTRY_ADDRESS` (now dynamic). Switched to the new `tx({to, data})` API. |
| `use-subspace.ts` | Stays hand-rolled (no SDK helper for the 12-variant subspace matrix), but updated to call `tx({to: SPACE_REGISTRY_ADDRESS, data: callData})` for the new API. |

---

## Phase 3.13 — Governance page surfaces the v0.20 `votingSettings` 7-tuple

**Why:** In v0.20 the `IDAOSpace.VotingSettings` struct returned by `votingSettings()` grew from a single "pass threshold" field to seven fields. The governance page was still rendering only the legacy `duration` + `partialPercentageSupportThreshold` (the renamed `slowPathPercentageThreshold`). Per ticket scope, all 7 fields should be legible and the old field names should be gone from the codebase.

### v0.20 struct (verified against `node_modules/.bun/@geoprotocol+geo-sdk@0.20.0-beta.1/.../dist/src/abis/dao-space.d.ts`)

```
struct VotingSettings {
  uint256  partialPercentageSupportThreshold;    // RATIO_BASE (10^7) → %
  uint256  universalPercentageSupportThreshold;  // RATIO_BASE (10^7) → %
  uint256  flatSupportThreshold;                 // editor count (fast-path)
  uint256  quorum;                               // editor count
  uint256  duration;                             // seconds
  bool     disableFastPathAccessForNewMembers;
  uint256  executionGracePeriod;                 // seconds
}
```

Confirmed `flatSupportThreshold` and `quorum` are counts (not RATIO_BASE percentages) via the SDK's `validateVotingSettingsInput`: "must be between 0 and N (number of initial editors)".

### Audit of stale references

`grep -rn slowPathPercentageThreshold|fastPathFlatThreshold` returned **0 hits**. `grep -rn 'votingSettings\.'` returned only the two lines in `governance/page.tsx`. Migration is fully contained to that one file.

### File changed

`apps/web/app/space/[id]/(space)/governance/page.tsx`:

- Added `formatEditorCount(value): "{n} editor(s)"` for `flatSupportThreshold` and `quorum`.
- Derived all 7 values from `votingSettings` (fall-backs for the loading case).
- New layout (chosen via design review):
  - **Status badge** above the metadata rows — `bg-successTertiary text-green` for "New members: fast path enabled", `bg-errorTertiary text-red-01` for "New members: slow path only". Matches the existing `accept-or-reject-*` badge convention so we don't introduce ad-hoc tokens.
  - **Row 1 (governance config, 5 boxes):** Voting period (with `+Xh grace` sub-line for `executionGracePeriod`), Partial support (%), Universal support (%), Flat threshold (editor count, "fast-path" sub-line), Quorum (editor count).
  - **Row 2 (proposal stats, 2 boxes — unchanged):** Active proposals, Accepted vs. rejected.

### Why not one big row of 7 boxes?

Considered it but every `GovernanceMetadataBox` is `w-full`, so 7-across crushes the labels. Splitting into a config row + stats row reads top-to-bottom as "here's how this DAO is configured / here's what's happening with it" — closer to the user's mental model and matches the existing visual rhythm.

### Acceptance criteria

- All 7 fields render legibly without `slowPathPercentageThreshold` or `fastPathFlatThreshold` referenced anywhere — verified by grep.
- `tsc --noEmit` clean.
- Design open for review; layout was picked off three previewed options.

---

## Phase 3.14 — Expose v0.20 voting settings in the create-space flow

**Why:** Before this change, `use-deploy-space.ts` hardcoded all 7 voting settings inline at the `getCreateDaoSpaceCalldata` call. Users had no way to configure governance parameters at create time and were stuck with whatever the hook chose. v0.20 introduced 3 new threshold fields (universal/flat/grace-period) that nobody on a new DAO could see or tune until after creation.

### Default behavior fix

The previous inline literal set `flatSupportThreshold: 0`. Combined with the contract's fast-path check (must have `>= flatSupportThreshold` editor approvals AND `flatSupportThreshold > 0` for the path to be reachable), this **effectively disabled the fast path** on every new DAO. Changed the default to `1`, matching the SDK's own `DEFAULT_VOTING_SETTINGS`. Anyone who wants the slow-only behavior can set it to 0 explicitly in Advanced settings.

### Files changed

`apps/web/core/hooks/use-deploy-space.ts`:
- New exported constant `NEW_SPACE_DEFAULT_VOTING_SETTINGS` (consumable by the UI for form defaults).
- New exported type `VotingSettingsInput` derived from `Parameters<typeof getCreateDaoSpaceCalldata>[0]['votingSettings']`. SDK doesn't re-export `VotingSettingsInput` from its public entry, so this keeps the SDK as the single source of truth without a deep import.
- `DeployArgs` and the internal `CreateDaoSpaceParams` both gained an optional `votingSettings`. When `undefined`, falls back to `NEW_SPACE_DEFAULT_VOTING_SETTINGS`.
- Personal-style spaces (which have no voting settings) ignore the field — the param only flows through the DAO branch.

`apps/web/partials/create-space/create-space-dialog.tsx`:
- New `votingSettingsAtom` (`VotingSettingsInput | null`). Reset to `null` whenever the dialog closes.
- New `Step` value `'configure-governance'`.
- `StepEnterProfile` shows an "Advanced settings" link under the Create Space button, *only* for `governanceType === 'DAO'`. Reads the atom to show "(customized)" suffix when the user has overrides.
- New `StepConfigureGovernance` component with 7 controls (6 numeric inputs + 1 checkbox), client-side validation via `parseSettings(...)`, "Save settings" / "Reset to defaults" actions, scrollable form area for the fixed-height modal.
- `StepHeader` extended to render a back arrow on the new step and hide the close button so the user can't dismiss the dialog mid-edit and lose state.
- `createSpaces(...)` now passes `votingSettings: votingSettings ?? undefined` through to `deploy(...)`.

### Validation

Mirror of the SDK's `validateVotingSettingsInput`:
- All fields must be finite numbers.
- Partial / universal support: 0-100 (percent).
- Flat threshold: non-negative integer.
- Quorum: integer >= 1.
- Voting duration: >= 1 minute (MINIMUM_VOTING_DURATION_DAYS = 1/24/60).
- Execution grace period: >= 1 hour (MINIMUM_EXECUTION_GRACE_PERIOD_DAYS = 1/24).

We do client-side checks for fast feedback; the contract still enforces these on chain. Editor-count bounds (e.g. flat <= totalEditors) are deferred to the contract since at create time we don't yet have an editor count larger than 1.

### Initial editors / members

Intentionally **not** exposed — keeping `[creator]` as the only option. Bootstrapping multi-editor DAOs at creation time requires a way to look up other users' personal-space IDs, which is a much heavier UX problem. Editors can still be added post-create via the existing add-editor proposal flow.

### Acceptance

- `tsc --noEmit` clean.
- DAO creation still works with the legacy "click through" path (no advanced settings selected → defaults applied).
- DAO creation with custom settings flows the user's values into `getCreateDaoSpaceCalldata`. Settings reset on dialog close.
- Personal-style space creation unaffected (no UI surface, no atom read).

---

## Phase 4 — `.env.example` template (deferred)

To be added once edit mode works. Will document the env vars needed to point geobrowser at the local e2e stack.

---

## Open / deferred items

- `Graph` namespace is `@deprecated` in v0.20. Used in 7 spots in our codebase. Not blocking (still compiles), but worth a follow-up to migrate to `Ops` + `createGeoClient`.
- `geobrowser.env.example` template for local-dev (Phase 4 — pending).
- End-to-end verification: connect wallet, enter edit mode, make a change. Typecheck is green, but runtime correctness of the SDK rename/migration needs to be eyeballed against the running app.

## Things we explicitly did NOT do

- **No geo-sdk patch.** The test repo's `patches/@geoprotocol%2Fgeo-sdk@0.18.0.patch` is unnecessary in v0.20 because `defineGeoNetworkConfig` is a first-class export. Confirmed via the v0.20 typings: `GeoNetworkConfig` accepts `apiOrigin`, `chain.{id,rpcUrl}`, and `contracts.{SPACE_REGISTRY_ADDRESS, DAO_SPACE_FACTORY_ADDRESS, ...}`.
- **No migration off the deprecated `Graph` namespace.** Logged as a follow-up to keep this PR focused.
- **No mainnet network config.** Only built-in network in v0.20 is `'TESTNET'` (via `GeoTestnetConfig`). Production mainnet would need a `defineGeoNetworkConfig({ id: 'MAINNET', ... })` too — flagged for the broader migration, not this branch.

## Backup branches (in case anything goes sideways)

- `mainnet-migration-v020-backup-<timestamp>` × 2 (created before each rebase attempt during Phase 0). Find them with `git branch | grep backup`.
- `stash@{0}` — `geo-sdk 0.20-beta.0 bump` from an earlier reset; redundant now but kept until the working state is committed.

---

## Mainnet blockers (added 2026-07-02, from branch code review)

`environment.ts` retains a full mainnet (chainId `80451`) branch, but flipping the env
var today would produce a broken mixed-network app. Everything below must land before
mainnet is real; until then treat `chainId=80451` as unsupported:

- [ ] **Contract addresses** — `core/utils/contracts/space-registry.ts` and
      `dao-space-factory.ts` hardcode the testnet-55516 deployments unconditionally.
      Needs a per-network switch once mainnet v2 contracts are deployed.
- [ ] **Geo client** — `core/sdk/geo-client.ts` hardcodes `GeoTestnetConfig`. v0.20 has
      no built-in MAINNET network; needs `defineGeoNetworkConfig({ id: 'MAINNET', ... })`.
- [ ] **Wallet chain pin** — `core/wallet/wallet.tsx` pins wagmi to `getGeoChain('TESTNET')`
      regardless of `Environment.variables.chainId`, while `privy.tsx`/`geo-chain.ts`
      follow the env → mixed-chain signatures if the env flips.
- [ ] **Smart-account path** — the ZeroDev EIP-7702 kernel flow only exists for 55516;
      mainnet still assumes the old Safe+Pimlico path. Decide the mainnet AA story.
- [ ] **GraphQL codegen** — `codegen.ts` generates from the testnet v2 schema
      (`testnet-api-v2.geobrowser.io`); mainnet currently serves v1. All hand-written
      queries in the app are now v2-shaped and would fail against a v1 mainnet API.
- [ ] **ZeroDev sponsorship policy** — confirm origin/contract policies on the ZeroDev
      dashboard for whichever project id ships (the project id is client-exposed via
      `NEXT_PUBLIC_ZERODEV_RPC_URL_*`).
