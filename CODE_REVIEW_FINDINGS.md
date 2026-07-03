# Code review findings — `mainnet-migration-v020` vs `upstream/master`

Reviewed 2026-07-02 (13 commits, 64 files, ~2.7k insertions). Focus: regressions around the
v0.20 SDK / v2 API / new data model, plus antipatterns. Findings verified against the live
v2 testnet API and the installed `@geoprotocol/geo-sdk@0.20.0-beta.5` where noted.

Status legend: **OPEN** = not fixed, tracked here. **RESOLVED** = addressed on this branch.
**MOOT** = premise no longer holds.

---

## Major

### 1. RESOLVED (Batch 1) — Three v1-shaped GraphQL queries broken by the v2 endpoint switch; errors swallowed into empty data
Fixed: browse-sidebar pending indicators now use upstream's v2-correct
`fetch-pending-membership-space-ids.ts` helper (adopted during the 2026-07-02
upstream/master merge; it supersedes the interim inline rewrite and REST-confirms each
candidate space); `fetch-proposals-by-user` moved to `proposalsCurrentsConnection`
(orderBy CREATED_AT_DESC since endTime=0 would sort fresh proposals last);
`fetch-in-flight-subspace-proposals.ts` deleted (zero callers, and v2 has no ADD_SUBSPACE
action type — subspaces are already served by the v2-shaped `fetch-active-subspaces.ts`).
Audit also removed dead v1 query files with no importers: `fetch-parent-entity-id.ts`,
`fetch-entity-type.tsx`, `fetch-spaces-where-editor.ts`, `fetch-tab.ts`,
`fetch-subspaces.ts`, `subgraph/fragments.ts`, `dto/subspaces.ts`.
All three verified failing live against `testnet-api-v2.geobrowser.io`:

- `apps/web/core/browse/fetch-browse-sidebar-data.ts:85-118` — uses `endTime` and
  `proposalActionsConnection` on `ProposalFilter` (neither exists in v2) → `GRAPHQL_VALIDATION_FAILED`
  → `pendingMemberIds` / `pendingEditorIds` silently `[]`. Browse sidebar loses pending
  member/editor join indicators entirely.
- `apps/web/core/io/fetch-proposals-by-user.ts:39-72` — `orderBy: END_TIME_DESC` doesn't exist in
  v2 `ProposalsOrderBy`; `name` / `startTime` / `endTime` moved off `Proposal` to `ProposalVersion`
  → error swallowed → activity-page proposals and ranking pending proposals
  (`core/blocks/ranking/fetch-ranking-pending-proposals.ts:44`) always empty.
- `apps/web/core/io/subgraph/fetch-in-flight-subspace-proposals.ts:12-41` — v1 filter shape
  (`type` / `endTime`), `equalTo` instead of v2's `is`, and the v1 `proposals → proposedSubspaces`
  selection → always returns `[]`; in-flight subspace proposals never render.

Same failure class as the governance-counter bug fixed in `1bd6570fa`: endpoint moved to v2,
queries didn't, Effect fallbacks convert schema errors into empty results with only a
server-side `console.error`.

### 2. RESOLVED (Batch 2) — Votes never pass the proposal version; everything votes on version 1
Fixed: `ApiProposalBaseFields` decodes `proposalVersion` (optional for older API deploys);
threaded through the Proposal DTO / home-row mappers / all three vote components into
`useVote`, which now passes `versionId` to `geo.daoSpaces.voteProposal`. When the REST
payload omits it, behavior falls back to the SDK default (1) — same as before.
`apps/web/core/hooks/use-vote.ts:101` calls `geo.daoSpaces.voteProposal({ authorSpaceId, spaceId,
proposalId, vote })`. SDK v0.20 vote calldata is `(bytes16 proposalId, uint8 versionId, uint8 voteOption)`
and the SDK defaults `versionId` to **1** when omitted (`dist/src/client/dao-spaces.js:514-520`).
The REST status payload exposes `proposalVersion`, but `ApiProposalBaseFields`
(`apps/web/core/io/rest/schemas/proposal.ts:95`) doesn't decode it, so the UI has nothing to pass.
Latent today — testnet has zero `currentVersion > 1` proposals — but the moment anything uses
`PROPOSAL_UPDATED`, every vote from this UI targets the superseded version.
Fix path: decode `proposalVersion` in the REST schema, thread it to `useVote`, pass `versionId`.

### 3. MOOT (backend fixed) — FAST proposals in `flatSupportThreshold = 0` DAOs were unvoteable
The contract-side `CanNotVote()` revert for FAST votes in flat=0 DAOs has been fixed by the
backend team (confirmed 2026-07-02). Consequently:
- The FAST→SLOW downgrade guardrail from commit `11c369ac0` was **reverted** in
  `apps/web/core/hooks/use-publish.ts` (editors publish FAST again unconditionally).
- The gap this review found (membership hooks `use-propose-add-member.ts:41` /
  `use-propose-remove-member.ts:41` defaulting FAST without a threshold check) is no longer
  a trap.
- The `Space.flatSupportThreshold` DTO/schema/fragment plumbing was kept (still useful metadata);
  stale CanNotVote comments were updated.
Confirmed semantics after the fix (2026-07-02): a flat=0 FAST proposal is voteable and passes
with a single editor vote.
Residual watch item: existing FAST proposals created *before* the backend fix in flat=0 spaces
— verify they are now voteable, or they remain dead on-chain.

### 4. RESOLVED (Batch 3) — Create-space advanced settings can deploy misconfigured DAOs or guarantee deploy failure
Fixed: `parseSettings` rejects blank/whitespace fields before Number() conversion, and runs
the SDK's `validateVotingSettingsInput(settings, 1)` (1 = the creator, matching deploy-time
`initialEditorSpaceIds`) so quorum/flat values the deploy would reject fail at save time.
`apps/web/partials/create-space/create-space-dialog.tsx:787-828` (`parseSettings`):
- **No upper bound vs initial editor count.** SDK's `validateVotingSettingsInput` throws for
  `flatSupportThreshold > 1` or `quorum > 1` with 1 initial editor
  (`dist/src/encodings/get-create-dao-space-calldata.js:107-151`). "Quorum = 3" saves fine,
  then every create attempt runs the IPFS publish + contract reads and dies on a raw SDK error
  string. The SDK exports `validateVotingSettingsInput` — the dialog should call it pre-save.
- **`Number('') === 0`.** Clearing a percentage field passes the 0–100 range check → DAO deploys
  with a 0% support threshold; a slow-path proposal with a single NO vote still passes at window
  end. Whitespace-only input behaves the same; the "must be valid numbers" error can never fire
  for empty strings.

### 5. OPEN — Receipt-wait wrapper makes retried publishes double-submit-capable
`apps/web/core/hooks/use-smart-account.ts:59-68` wraps `sendUserOperation` to await
`waitForUserOperationReceipt` (viem default 120s timeout; rejects on transient RPC errors while
polling). Failure can now occur *after* the bundler accepted the userOp. Callers wrap it in
`Effect.retry` (`use-publish.ts` retrySchedule, `use-create-comment.tsx:335`,
`use-ranking-submissions.ts:195`, `create-personal-space-on-chain.ts:180`) under the old
at-most-once assumption → receipt-poll blip → retry re-submits → duplicate edit/comment/proposal
on-chain. Also: only `sendUserOperation` is serialized; `sendTransaction` (all governance writes
via `useSmartAccountTransaction`) is unwrapped, so a vote fired during a pending publish can
still hit the AA25 nonce race the wrapper was added for.

### 6. OPEN — Legacy users without a Privy embedded wallet are silently bricked
`apps/web/core/hooks/use-smart-account.ts:32-35` requires a wallet with
`walletClientType === 'privy'`, but `createOnLogin: 'users-without-wallets'`
(`apps/web/core/wallet/privy.tsx:21`) doesn't create an embedded wallet for users who already
have any linked external wallet (e.g. a pre-migration MetaMask link). For them `smartAccount`
is permanently `null` with `isLoading: false` — indistinguishable from logged-out, no error
surfaced. Related: `useQuery`'s `error` is never read anywhere in the hook, so *any* init
failure (Privy signing, bad ZeroDev URL, 7702 kernel setup) is silent.
Consider `createOnLogin: 'all-users'` + an explicit error state.

### 7. OPEN (posture, partly pre-existing) — Mainnet (80451) configuration is incoherent
`environment.ts` keeps a full mainnet branch implying support, but:
- `apps/web/core/utils/contracts/space-registry.ts:4` / `dao-space-factory.ts:3` hardcode
  testnet-55516 deployments unconditionally.
- `apps/web/core/sdk/geo-client.ts:3` hardcodes `GeoTestnetConfig` (pre-existing upstream).
- `apps/web/core/wallet/wallet.tsx:19` pins wagmi to `getGeoChain('TESTNET')` regardless of
  `Environment.variables.chainId` (pre-existing), while privy.tsx/geo-chain.ts would follow
  the env → mixed-chain signatures if chainId flips.
- The EIP-7702 ZeroDev kernel path only exists for 55516; mainnet still assumes Safe+Pimlico.
- `apps/web/codegen.ts` generates types from the **testnet v2** schema; mainnet still serves v1.
Flipping `chainId` to '80451' today produces a broken mixed-network app. Fine while
testnet-only, but should be an explicit known-blocker for the actual mainnet migration.

---

## Minor

### 8. RESOLVED (Batch 1) — Multi-version proposals double-count in the new counters
Fixed: both counter queries moved to `proposalsCurrentsConnection` (proposal joined with
its current version), so endTime filters are current-version scoped by construction.
`apps/web/app/space/[id]/(space)/governance/page.tsx:260-292` and
`apps/web/core/io/fetch-sidebar-counts.ts:39-73`: Active matches
`some { endTime = 0 OR endTime > now }`, Rejected matches `some { 0 < endTime < now }` — over
*all* versions. A proposal whose v1 window expired then updated to a fresh v2 counts in both
buckets. Latent (zero multi-version proposals on testnet today). Correct filter scopes the
version row to `proposalVersion = currentVersion`.

### 9. OPEN — `use-entity-vote.ts` `objectType` param is dead
`apps/web/core/hooks/use-entity-vote.ts:21-51`: the SDK hardcodes object type `00000000` in the
vote topic (`client/entity-votes.js`), but the hook still accepts `objectType` and keys
read-queries (`entity-vote-count`, `user-entity-vote`) and telemetry by it. All current callers
pass 0; a future `objectType: 1` caller writes type-0 votes while reading type-1 tallies.
Either drop the param or fail loudly on non-zero.

### 10. OPEN — One-shot 5s vote refresh; timer not cancelled
`apps/web/partials/active-proposal/accept-or-reject.tsx:81-83`: `onVoteSuccess` schedules a
single `router.refresh()` at +5s. Indexer lag > 5s (common) → tallies/percentages and the
first-vote-stamped endTime stay stale until manual navigation. Timeout also fires after
unmount (harmless refresh, tiny leak).

### 11. OPEN — "local-dev" synthetic-home fallback runs in production
`apps/web/app/space/[id]/(space)/layout.tsx:149-183` and `page.tsx:231-241`: triggers whenever
`space.entity.id` is empty, which happens for any fresh space during the indexer-lag window
(not just e2e bootstrap). Effects: extra `cachedFetchEntityPage` per render, verbose
`console.log('[local-dev synthetic-home]...')` in prod server logs, and edits made during the
window attach to a synthetic entity id (`id = spaceId`) that diverges from the real home entity
once indexed.

### 12. RESOLVED (Batch 3) — Create-space dialog state leaks / dead code
Fixed: `useOpenCreateSpaceDialog` now resets `votingSettingsAtom` on every open; the
unimplemented `cloneFromEntity` preset/atom was deleted (`autoRun` kept — its mechanism is
fully implemented, just awaiting the claim-flow caller).
`apps/web/partials/create-space/create-space-dialog.tsx`:
- `useOpenCreateSpaceDialog` (103-119) resets every preset atom except `votingSettingsAtom`;
  re-opening via preset while already open (close-effect at 148-155 never fires) silently
  applies the previous session's custom voting settings.
- `cloneFromEntity` (60-62, 82-84) is documented ("copy entity content after deploy") but
  nothing implements it; `autoRun` and `cloneFromEntity` currently have zero callers.

### 13. OPEN — Mock/test wallet config can no longer produce a smart account
`apps/web/core/wallet/wallet.tsx:27-29` + `use-smart-account.ts:32-35`: with
`NEXT_PUBLIC_IS_TEST_ENV=true` the mock wagmi walletClient is ignored — the 55516 path requires
a Privy embedded wallet, which never exists in test env → `smartAccount` always null; any
E2E flow exercising transactions via the mock connector is dead. The "local-dev EOA polyfill"
comment in `use-smart-account-transaction.ts:14` is stale (fallback was removed in `500f4f659`).

### 14. OPEN (confirm externally) — ZeroDev project id is client-exposed
`apps/web/.env.example:14` / `config.ts:44`: `NEXT_PUBLIC_ZERODEV_RPC_URL_TESTNET` embeds the
ZeroDev project id in a client bundle URL. Same exposure class as the pre-existing
`NEXT_PUBLIC_PIMLICO_API_KEY` — acceptable only if the ZeroDev dashboard enforces
origin/contract sponsorship policies. Action: verify project policy settings.

---

## Verified clean (for the record)

- `createGeoZeroDev7702WalletClient` usage matches beta.5 typings exactly; lockfile resolves
  `geo-sdk@0.20.0-beta.5`, `@zerodev/sdk@5.5.10`; Privy `toViemAccount` local-account workaround
  is legitimate.
- New factory/registry addresses exactly match the SDK's TESTNET constants; vote/execute target
  the same registry address.
- `getApiProposalCanExecute` (canExecute ∧ quorum ∧ threshold, commit `7fb5220ef`) held up
  against live API samples; the detail page's on-chain simulation backstops residual risk.
- `endTime = 0` handling consistent across `deriveProposalStatus`, `getIsProposalEnded`,
  status chips, cards, pending pages.
- Membership/editor proposal calldata and the `{to, calldata}` migration correct at all call
  sites; dropping explicit `votingMode: 'SLOW'` on editor proposals is safe (SDK enforces SLOW).
- Env-var rename `NEXT_PUBLIC_ZERODEV_RPC_URL_TESTNET` complete across config/CI/vite;
  auth package mainnet Safe+Pimlico path behavior-preserving vs upstream.
- Test diffs only add newly-required fixture fields; no assertions weakened.
- REST `orderBy=end_time desc` returns endTime-0 rows first (NULLS FIRST) — home review lists
  don't truncate them. Watch item: the `asc`-ordered governance PROPOSED bucket (limit 100)
  could push endTime-0 rows last in a space with >100 pending proposals.
