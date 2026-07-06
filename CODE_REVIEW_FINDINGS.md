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

### 5. RESOLVED (Batch 4) — Receipt-wait wrapper makes retried publishes double-submit-capable
Fixed in `use-smart-account.ts`: every send (`sendTransaction` and `sendUserOperation`)
now goes through one serialization queue (closes the AA25 race for governance writes
too), and after submission only the receipt *wait* is retried — failures are held until
90s (past every caller's 10s Effect.retry window) before surfacing with the userOp hash,
so caller retries can no longer re-submit an op that already landed. Note: a write can
now queue behind a pending publish; the 45s timeout in useSmartAccountTransaction covers
queue + submit.
`apps/web/core/hooks/use-smart-account.ts:59-68` wraps `sendUserOperation` to await
`waitForUserOperationReceipt` (viem default 120s timeout; rejects on transient RPC errors while
polling). Failure can now occur *after* the bundler accepted the userOp. Callers wrap it in
`Effect.retry` (`use-publish.ts` retrySchedule, `use-create-comment.tsx:335`,
`use-ranking-submissions.ts:195`, `create-personal-space-on-chain.ts:180`) under the old
at-most-once assumption → receipt-poll blip → retry re-submits → duplicate edit/comment/proposal
on-chain. Also: only `sendUserOperation` is serialized; `sendTransaction` (all governance writes
via `useSmartAccountTransaction`) is unwrapped, so a vote fired during a pending publish can
still hit the AA25 nonce race the wrapper was added for.

### 6. RESOLVED (Batch 4) — Legacy users without a Privy embedded wallet are silently bricked
Fixed: `privy.tsx` uses `createOnLogin: 'all-users'` (users with only a linked external
wallet now get an embedded wallet — takes effect on their next login), and
`useSmartAccount` exposes + logs the init `error` so failures are distinguishable from
logged-out. Consumers can adopt the error state incrementally.
`apps/web/core/hooks/use-smart-account.ts:32-35` requires a wallet with
`walletClientType === 'privy'`, but `createOnLogin: 'users-without-wallets'`
(`apps/web/core/wallet/privy.tsx:21`) doesn't create an embedded wallet for users who already
have any linked external wallet (e.g. a pre-migration MetaMask link). For them `smartAccount`
is permanently `null` with `isLoading: false` — indistinguishable from logged-out, no error
surfaced. Related: `useQuery`'s `error` is never read anywhere in the hook, so *any* init
failure (Privy signing, bad ZeroDev URL, 7702 kernel setup) is silent.
Consider `createOnLogin: 'all-users'` + an explicit error state.

### 7. OPEN (tracked) — Mainnet (80451) configuration is incoherent
Not fixable until mainnet v2 API + contracts exist. A "Mainnet blockers" checklist was
added to `V020_MIGRATION_LOG.md` (2026-07-02) covering: contract-address switch, MAINNET
geo-client config, wagmi chain pin, AA path decision, codegen/v1-API mismatch, ZeroDev
policy check.
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

### 9. RESOLVED (Batch 5) — `use-entity-vote.ts` `objectType` param is dead
Fixed: the param was removed from `useEntityVote` and `EntityVoteButtons`; reads pin the
same object type 0 the SDK hardcodes for writes (constant + comment). The
`contracts/entity-vote.ts` encoders remain as documented reference for the topic layout.
`apps/web/core/hooks/use-entity-vote.ts:21-51`: the SDK hardcodes object type `00000000` in the
vote topic (`client/entity-votes.js`), but the hook still accepts `objectType` and keys
read-queries (`entity-vote-count`, `user-entity-vote`) and telemetry by it. All current callers
pass 0; a future `objectType: 1` caller writes type-0 votes while reading type-1 tallies.
Either drop the param or fail loudly on non-zero.

### 10. RESOLVED (Batch 5) — One-shot 5s vote refresh; timer not cancelled
Fixed: `accept-or-reject.tsx` refreshes on a backoff (3s/7s/15s/30s) so slower indexer
lag still converges, and all pending timers are cancelled on unmount.
`apps/web/partials/active-proposal/accept-or-reject.tsx:81-83`: `onVoteSuccess` schedules a
single `router.refresh()` at +5s. Indexer lag > 5s (common) → tallies/percentages and the
first-vote-stamped endTime stay stale until manual navigation. Timeout also fires after
unmount (harmless refresh, tiny leak).

### 11. RESOLVED (Batch 5) — "local-dev" synthetic-home fallback runs in production
Fixed: both fallbacks (space layout + page) are gated on
`NEXT_PUBLIC_IS_TEST_ENV === 'true'` — the same flag that gates the mock wallet. On
testnet/mainnet a fresh space now renders its (empty) real entity during indexer lag
instead of adopting a synthetic id that diverges once indexed.
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

### 13. OPEN (comment fixed) — Mock/test wallet config can no longer produce a smart account
The stale "local-dev EOA polyfill" comment in `use-smart-account-transaction.ts` was
corrected (Batch 4). The substantive question remains: if E2E transaction coverage is
wanted, the 55516 path needs a test-env signer; otherwise remove `createMockConfig`.
`apps/web/core/wallet/wallet.tsx:27-29` + `use-smart-account.ts:32-35`: with
`NEXT_PUBLIC_IS_TEST_ENV=true` the mock wagmi walletClient is ignored — the 55516 path requires
a Privy embedded wallet, which never exists in test env → `smartAccount` always null; any
E2E flow exercising transactions via the mock connector is dead. The "local-dev EOA polyfill"
comment in `use-smart-account-transaction.ts:14` is stale (fallback was removed in `500f4f659`).

### 14. RESOLVED (geo-sdk beta.8, 2026-07-06) — ZeroDev project id is client-exposed
`apps/web/.env.example:14` / `config.ts:44`: `NEXT_PUBLIC_ZERODEV_RPC_URL_TESTNET` embeds the
ZeroDev project id in a client bundle URL. Same exposure class as the pre-existing
`NEXT_PUBLIC_PIMLICO_API_KEY` — acceptable only if the ZeroDev dashboard enforces
origin/contract sponsorship policies. Action: verify project policy settings.

**Resolution:** geo-sdk 0.20.0-beta.8 bakes the sponsorship endpoint into
`GeoTestnetConfig.sponsorship.rpcUrl` — the same project id we had in `.env.local`, i.e. it was
Geo's shared project all along and its dashboard policy is theirs to manage. The env var is now
an optional local-anvil override only (`config.ts` no longer throws, `.env.local` value removed);
`generateZeroDevAccount` defaults to the SDK config. The Pimlico key exposure remains a
mainnet-path concern (see V020_MIGRATION_LOG mainnet blockers).

---

## Round 2 — geo-sdk behavior review vs upstream/master (2026-07-06)

Four-way parallel subagent review of the full branch diff (upstream pins geo-sdk 0.19.4;
branch is on 0.20.0-beta.8). Every SDK call shape was verified against the installed
beta.8 dist. The beta.8 wallet-client migration itself came back clean — findings below
are in surrounding code, most pre-dating the SDK bump.

### 15. OPEN — Major — Serialization queue is per-queryFn instance; react-query refetches defeat the AA25 protection
`use-smart-account.ts:80`: `sendChain` lives inside `queryFn`, but the app uses a default
`new QueryClient()` (staleTime 0, refetchOnWindowFocus true) and the queryKey includes
`cookies.walletAddress` — which the queryFn itself writes. Any refetch (window focus,
cookie write during login) builds a NEW wrapped client with a fresh empty queue while
closures from earlier renders still hold the old one. Scenario: publish in flight on the
old instance's queue → tab away/back → vote goes through the new instance's empty queue →
parallel submission, same kernel nonce → AA25. Fix: hoist the queue (module-level, keyed
by EOA address) so all client instances for one signer share it.

### 16. OPEN — Major — 45s tx timeout races the 90s queue hold; a timed-out call still submits later
`use-smart-account-transaction.ts:53-56`: `Effect.timeoutFail(45s)` wraps
`smartAccount.sendTransaction`, which is `enqueue(...)`. Effect interruption does not
dequeue the task — once enqueued it always runs when the queue drains. A queued
`sendUserOperation` ahead of it can hold the queue up to 90s (`RECEIPT_DEADLINE_MS`), so
the file's comment ("45s covers queue time + submission") is wrong. Scenario: slow publish
holds the queue >45s → user's vote/membership request errors "Transaction timed out" →
user retries → BOTH queued txs eventually execute → duplicate op on-chain. This is the
formalization of the RETEST_CHECKLIST A6 watch item. Fix: timeout > worst-case queue hold,
or make enqueued tasks abortable before submission.

### 17. VERIFY — Minor — Personal-space creation emits `TOPIC_DECLARED` while set-topic migrated to the SDK's `TOPIC_SET`
`create-personal-space-on-chain.ts:171` (via `buildPersonalTopicDeclaredCalldata`,
`space-topic.ts:33,56`) still emits `keccak('GOVERNANCE.TOPIC_DECLARED')`; the migrated
`use-space-topic.ts:88` uses `geo.personalSpaces.setTopic` → `GOVERNANCE.TOPIC_SET`
(beta.8 has no TOPIC_DECLARED anywhere). Mitigation: the v2 REST schema lists BOTH
`SET_TOPIC` and `TOPIC_DECLARED` as action types (`dto/proposals.ts:29`,
`rest/validation.ts:86`), so the indexer likely accepts both — but if it ever drops the
legacy name, personal-space deploys hang in `waitForSpaceIndexed`. Action: confirm with
the API team which names the v2 indexer consumes; converge the three sites.

### 18. OPEN — Minor — Mainnet chain's native currency silently changed ETH → GEO
`packages/auth/src/chain.ts:16`: upstream declared `{name:'Ethereum', symbol:'ETH'}` for
both networks; the branch declares GEO for both. Correct for testnet 55516, but the
mainnet (80451) entry changed too, outside the stated migration — wallets prompted via
`wallet_addEthereumChain` and balance/fee formatting would label mainnet gas "GEO".
Confirm 80451's actual gas token before the mainnet flip (fold into finding #7).

### 19. OPEN — Minor (latent) — `generateSmartAccount` lost its chain-id guard
`packages/auth/src/account.ts:95-115`: upstream branched on chain id with
testnet-specific Safe addresses; the new code applies canonical Safe addresses to
whatever chain is passed. A misrouted 55516 call now fails opaquely at first send
instead of loudly at init. Not reachable today (use-smart-account routes 55516 to
ZeroDev first) — add a `chain.id === mainnet` assertion when touching this next.

### 20. OPEN — Minor — `rpcUrl: config.rpc` always overrides the SDK's built-in chain RPC
`use-smart-account.ts:44`: the in-code comment says "on real testnet the SDK default
applies", but that's only true for sponsorship — `NEXT_PUBLIC_GEOGENESIS_RPC_TESTNET` is
required non-null, so the SDK's built-in 55516 RPC is never used. The env var name
survived the 19411→55516 chain move, so a stale deployment env (Vercel preview) silently
yields a kernel client whose transport serves the wrong chain. Options: pass `rpcUrl`
only alongside the local-anvil sponsorship override, or assert `eth_chainId` at init.

### 21. OPEN — Minor — Logged-in testnet users briefly read as logged-out while Privy wallets load
`use-smart-account.ts:23-35`: the testnet path gates on `embeddedWallet` from Privy's
`useWallets`, but `isLoading` only tracks the wagmi `useWalletClient`. If wagmi settles
first, consumers momentarily see `smartAccount === null, isLoading === false` — mount-time
logic treating that as "logged out" (hidden write UI, redirects) misfires. Consult
`useWallets().ready` in the loading signal.

### 22. OPEN — Minor — Stale optimistic vote choice if the vote tx fails after unmount
`accept-or-reject.tsx:69,176-192`: `addOptimisticVote` is set at click; removal relies on
the mutation `onError` (doesn't fire after unmount) or the server `userVote` effect.
Close the review slide-over while the tx is pending and let it revert → "You accepted"
renders for the rest of the session with the vote buttons hidden. Clear the atom from a
mutation-scoped callback that survives unmount (e.g. mutation cache subscription), or
re-validate the atom against `userVote === null` after votingEnded/refetch.

### 23. OPEN — Minor — Outcome footer renders the Unix epoch for terminal endTime=0 proposals
`my-governance-proposal-card.tsx:88-98`, `pending-proposals-page.tsx:247-256`: the new
`endTime <= 0` guard covers only the not-ended branch; the
ACCEPTED/REJECTED/votingEnded branch formats `endTime` unconditionally → "January 1,
1970" if a proposal can reach a terminal state without the window opening. Cheap
`endTime > 0` guard on that branch.

### 24. NOTE — versionId silently defaults to 1 when the API omits `proposalVersion`
`use-vote.ts:112`: all three voting surfaces thread `proposal.version` correctly, but the
REST schema marks it optional — an API row missing the field degrades to voting on
version 1 with no stale-toast. Residual of resolved #2. Consider failing loudly (or
refetching) when a DAO-space proposal arrives without a version.

### Round-2 verified clean (for the record)

- **beta.8 wallet-client migration**: `createGeoWalletClient` / `defineGeoNetworkConfig`
  / `GeoTestnetConfig` usage verified against installed dist; the spread-merge preserves
  all required fields; the `GeoWalletClient` casts are runtime-sound (KernelAccountClient
  provides account/sendTransaction/sendUserOperation/waitForUserOperationReceipt);
  mainnet Safe+Pimlico body byte-for-byte upstream's else-branch.
- **Env plumbing**: `config.bundler` and `config.sponsorship` each consumed by exactly
  one chain branch; empty-string-as-unset works; `NEXT_PUBLIC_BUNDLER_RPC_TESTNET` has
  zero stale references; signer path safe (only the Privy embedded wallet, whose
  `toViemAccount` result has `signAuthorization`, ever reaches the 7702 client).
- **Write-path encodings**: proposeEdit/publishEdit, voteProposal (bytes16 + uint8 + uint8),
  entity votes (arg order + `PERMISSIONLESS.UPVOTED` hash + objectType 0), executeProposal,
  membership/editor proposals (SLOW default safe), create-DAO 7-field VotingSettings and
  validator mirror deploy-time editor count; factory/registry addresses byte-for-byte match
  SDK beta.8 TESTNET constants.
- **v2 data model**: governance counter bucketing exhaustive and non-overlapping vs the
  generated schema; DTO decoders null-safe on real payloads; proposalVersion threaded
  end-to-end; deleted v1 modules have no dangling importers; `formatThreshold` /100000
  correct for SDK RATIO_BASE 1e7; synthetic-home gating strictly test-env.
- Two agent claims were already answered by earlier live-API checks (see Verified clean
  below): `desc`-ordered lists return endTime-0 rows first, and `getApiProposalCanExecute`
  held up against live samples (FAST-proposal spot-check still worthwhile).

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
