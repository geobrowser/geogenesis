# E2E test plan — `mainnet-migration-v020`

Full manual coverage for everything on this branch (69 commits, ~117 files vs `upstream/master`):
the geo-sdk 0.19 → **0.20.1** migration, the Privy + ZeroDev EIP-7702 wallet rewrite, the
env-driven network identity work, the governance UI additions, the optimistic create-space
runner, and the v2 GraphQL query migration.

Supersedes `RETEST_CHECKLIST.md` (written against beta.8; sections A–F are folded in below).

Run on testnet (chain 55516) against the public staging deploy or `bun dev` with
`apps/web/.env.local`. Flows are ordered so each one leaves the state the next one needs —
running 1 → 9 in order is roughly 90 minutes and covers every changed write path.

---

## Preflight

- [ ] **P1. Use a fresh account for Account A.** Any account whose personal space was
      reassigned by the 2026-07-30 `overrideSpaceId` sweep (block 18482) is bricked: the
      indexer still serves the orphaned space id, the app picks it, and *every* write reverts
      with `SpaceNotActive()` (`0xa54aed6d`) regardless of which space you're writing to. That
      is a backend data bug, not a branch regression — testing on a bricked account will fail
      all of flows 1–9 for the wrong reason.
- [ ] **P2. Confirm the indexer is current** before starting, and again if writes stop
      appearing. Both hostnames serve the same backend:
      `https://api-testnet.geobrowser.io/graphql` and `https://testnet-api-v2.geobrowser.io/graphql`.
      (`testnet-api.geobrowser.io`, no `-v2`, is a *different, older* chain — ignore it.)
- [ ] **P3. Console open for the whole run.** Several checks below are console-only. Watch for
      `[SMART-ACCOUNT] initialization failed:`, `[VOTE]`, `[create-space]`, and any
      `ChainMismatch` / `Reverted` messages.

**Accounts needed**

| | Role | Used for |
|---|---|---|
| **A** | Creator / editor | Flows 1–5, 7, 8. Fresh Privy embedded wallet. |
| **B** | Outsider | Flows 6 and 9. Needs its own personal space (flow 1 for B too). |

---

## Flow 1 — Signup → personal space → first content

Covers: Privy `createOnLogin: 'all-users'`, ZeroDev 7702 kernel init, SDK-owned gas
sponsorship (no `NEXT_PUBLIC_ZERODEV_RPC_URL_TESTNET`), personal-space registration,
`geo.personalSpaces.publishEdit`, the pending-personal-space runner.

- [ ] **1.1** Log in fresh with the Privy embedded wallet. No
      `[SMART-ACCOUNT] initialization failed:` in console; wallet-address cookie is set to the
      **EOA** address.
- [ ] **1.2** Onboarding creates your personal space. The pending pill shows, then resolves;
      you land in the space. No gas prompt at any point (sponsorship is SDK-default now).
- [ ] **1.3** Create an entity in the personal space and publish. Publish completes, indexes,
      and reloads clean.
- [ ] **1.4** Reload mid-onboarding (if you can catch it) — personal-space creation is
      idempotent and must resume, not double-create.

> If 1.1–1.3 pass, the SDK bump + wallet stack is fundamentally sound. Everything after this
> is feature-level.

## Flow 2 — Content writes in the personal space

Covers: the `Graph.createImage` → `createGeoImage` migration (image node, video node, import),
`uploadGeoImage` for avatars, comments, rankings, entity votes, personal-space topic. All of
these moved off hardcoded `network: 'TESTNET'` literals onto the `GEO_NETWORK`-bound client —
the failure mode is a *silent* wrong-network upload, so verify the asset actually renders after
a hard reload, not just at upload time.

- [ ] **2.1 Image upload** — add an image block to an entity. Progress bar advances, image
      renders, and **still renders after a hard reload** (proves the CID pinned on the right
      network).
- [ ] **2.2 Video upload** — same, with a video. Uses the same pipeline.
- [ ] **2.3 Space avatar / cover** — set a space image. Renders after reload. (This is the
      `uploadGeoImage` path fixed in `1c74d4095`.)
- [ ] **2.4 Comment** — comment on an entity. Appears, survives reload.
- [ ] **2.5 Edit comment** — edit it. New text persists.
- [ ] **2.6 Ranking** — create a ranking block, submit an entry. `geo.personalSpaces.publishEdit`
      with name `Ranking: …`. Entry appears.
- [ ] **2.7 Ranking search "Add new"** — the add-new option shows in ranking search (upstream
      `f2340672e`).
- [ ] **2.8 Entity votes** — upvote an entity, reload (highlight + count persist), switch to
      downvote, then withdraw. Counts move correctly each time. `objectType` is now hardcoded
      to 0 on both read and write — a mismatch shows up as a vote that casts but never appears.
- [ ] **2.9 Space topic (personal)** — set a topic on your personal space via the topic dialog.
      Uses `geo.personalSpaces.setTopic`. Persists after reload.

## Flow 3 — Create a DAO space (optimistic runner)

Covers: `create-space-dialog`, advanced-governance validation, `PendingCreatedSpaceRunner`,
`PendingCreatedSpaceStatus`, the duplicate-deploy guard, the new voting-settings defaults.

- [ ] **3.1 Validation** — in the advanced governance step, blank any field → **"All fields are
      required."** No NaN reaches submit.
- [ ] **3.2 Out-of-range** — enter an out-of-range value → the SDK validator message surfaces
      (`validateVotingSettingsInput`, editor count 1).
- [ ] **3.3 flat = 0 warning** — set fast-pass threshold to 0 → warning that fast-path proposals
      pass with a single editor vote, but creation is still allowed.
- [ ] **3.4 Universal threshold floor** — the universal slider cannot go below the pass
      threshold; it defaults to 100%.
- [ ] **3.5 Dialog reset** — cancel, reopen → fields are back to defaults, not your abandoned input.
- [ ] **3.6 Create with defaults.** Dialog closes **immediately** and a **"Creating {name}…"
      pill** appears top-center, below the navbar, not overlapping the publish status bar.
- [ ] **3.7 Duplicate guard** — while the pill is up, reopen the dialog and try to create a
      second space. It must be refused. (Before the fix this minted a second DAO on-chain.)
- [ ] **3.8 Resolution** — the pill persists for the whole chain (IPFS + factory tx + receipt +
      up to ~120 s index wait), then you are **auto-navigated into the new space**, populated,
      not a 404. Console shows `[create-space] background deploy started` then `space created: …`.
- [ ] **3.9 Mid-flight reload** — start another create and reload before it resolves. The job is
      dropped (in-memory only, deliberately not persisted, because DAO deploy is **not**
      idempotent). The already-submitted space still appears in your spaces list on its own. No
      second deploy, and the create flow is **not wedged** — you can create again afterward.
- [ ] **3.10 Failure retry** — if a create fails, the status bar offers retry, and retrying
      revives that job (not a stale earlier one).
- [ ] **3.11 Defaults landed on-chain** — open the new space's governance page. Expect
      **Vote duration 24h · Pass 51% · Universal 100% · Fast pass 1 · Quorum 1**.

## Flow 4 — Publishing to a DAO space (path selector)

Covers: `ProposalPathSelector`, `useVotingSettings`, `usePublish` with the
`daoSpaceAddress`-free proposal params (geo-sdk #95), review-changes.

- [ ] **4.1** Make an edit in the DAO space and open Review. A **path selector** appears
      (DAO only — confirm it does *not* appear for a personal space).
- [ ] **4.2** The option copy reflects the space's real settings: "Only requires **1 editor**…"
      and "review over **24 hours** … **51%** pass rate".
- [ ] **4.3** Switch active space in the review panel → selector resets to **Fast path**.
- [ ] **4.4 Fast path publish** — publish on FAST. In a flat≤1 space it passes with a single
      editor vote; the edit lands.
- [ ] **4.5 Review path publish** — publish on SLOW. A proposal is created and appears in
      governance as Active with a countdown, *not* immediately applied.
- [ ] **4.6** Both proposals show correct author, name, and content diff on the governance page.

## Flow 5 — Voting, changing a vote, executing

Covers: `useVote` with `proposalVersion` threading, the optimistic vote atom (now choice-aware),
the server-reconciliation fix (`8942d0093`), executability gating, status chips, counters.

- [ ] **5.1 Vote from the active-proposal window.** Console `[VOTE]` shows a **numeric**
      `proposalVersion` — not `undefined`. (Omitted, the SDK defaults to version 1 and votes on
      a superseded version.)
- [ ] **5.2 Optimistic state** — the card immediately reads as voted and sinks to the bottom of
      the list; the "You accepted/rejected" chip shows your actual choice.
- [ ] **5.3 Reconciliation** — tallies refresh without a manual reload (backoff at ~3/7/15/30 s),
      and once the server agrees the local override is **retired** (chip stays correct rather
      than flipping back and forth).
- [ ] **5.4 Change your vote** on the still-open proposal (Accept → Reject). The chip and tallies
      follow. If the DAO's plugin refuses, the message must say **your original vote still
      stands** — not that the vote vanished.
- [ ] **5.5 Vote from Home → Pending proposals** (editor variant, then member variant).
- [ ] **5.6 Vote from Home → My governance proposals** card.
- [ ] **5.7 Execute** — once passing, the Execute button appears and execution succeeds.
      Uses `geo.daoSpaces.executeProposal` and a pre-send `assertSpaceRegistryDeployed()`.
- [ ] **5.8 Execute gating** — on a proposal that has *not* met quorum/threshold, the Execute
      button is **hidden**, not shown-then-reverting.
- [ ] **5.9 Counters** — Active / Accepted / Rejected on the governance page match reality for a
      space that has executed, rejected, and not-yet-started (`endTime=0`) proposals.
- [ ] **5.10 Expired proposal** — a proposal past its `executeBy` deadline reverts
      `CanNotExecute` forever. Known UI gap: it still reads "Pending execution" because the
      schema drops `executeBy`. Note it; it is not a regression from this branch.
- [ ] **5.11 Stale version** — vote on a proposal that was re-proposed (version bumped) since
      page load → stale-proposal toast + the review window closes. No raw error modal.

## Flow 6 — Membership and editorship (needs Account B)

Covers: `useRequestToBeMember`, `useRequestToBeEditor`, the four propose-add/remove hooks (all
of which lost `daoSpaceAddress`), and the home accept/reject cards.

- [ ] **6.1** As **B**, open A's DAO space and request membership. Optimistic "Requested" state
      shows and **survives a reload**.
- [ ] **6.2** As **A**, the request appears under Home → Pending proposals. Accept it.
- [ ] **6.3** As **B**, confirm you're now a member and can publish (member fast/slow path).
- [ ] **6.4** As **B**, request editorship. As **A**, accept from the editor card.
- [ ] **6.5** As **A**, propose removing B as editor, then as member. Both proposals build and
      execute.
- [ ] **6.6** Re-run 6.2 with **Reject** on a fresh request — the rejected path works and the
      counters update.

## Flow 7 — Edit space governance settings

Covers: `EditGovernanceSettings`, `useProposeVotingSettings`, `voting-settings.ts` parsing,
the diff UI, and the 4-field → 7-field settings migration end to end.

- [ ] **7.1** As a **non-editor** (Account B before 6.4), the ⋯ menu on the governance page does
      **not** offer "Edit space governance".
- [ ] **7.2** As an **editor**, open it. Fields are prefilled from the **current on-chain**
      settings (not defaults).
- [ ] **7.3** Cancel and reopen → form resets to on-chain values, no stale input.
- [ ] **7.4** Enter an invalid combination → inline validation message; submit stays disabled.
- [ ] **7.5** Enter a flat=0 / other risky value → orange warning shows but submit is allowed.
- [ ] **7.6** The footer shows **"Review path"** only — governance changes are SLOW-path at the
      contract level and the SDK rejects FAST here.
- [ ] **7.7** Submit → "Proposal submitted", modal auto-closes after ~2.5 s.
- [ ] **7.8** The proposal appears in governance with a **readable settings diff** (old → new per
      field), not raw calldata.
- [ ] **7.9** Vote it through and execute. Reload the governance page — the **five metadata
      boxes now show the new values**. This is the round-trip proof that the 7-field settings
      encode/decode correctly against the redeployed contracts.

## Flow 8 — Subspaces and DAO topics

Covers: `useSubspace` (hand-rolled calldata now posted to the dynamic `SPACE_REGISTRY_ADDRESS`),
`useSpaceTopic` DAO branch, and the deleted `fetch-subspaces` / `fetch-in-flight-subspace-proposals`
query paths.

- [ ] **8.1** Add a subspace to the DAO space. Proposal is created, votes through, executes.
- [ ] **8.2** The subspace renders in the subspaces dialog and the subtopic gallery.
- [ ] **8.3** Remove the subspace. Same round trip.
- [ ] **8.4** Set a **topic on the DAO space** (the hand-rolled `buildDaoTopicDeclaredCalldata`
      branch — no SDK helper exists for this). Persists after reload.

## Flow 9 — Resilience and negative paths

Covers: the per-EOA send queue, at-most-once submission, the reverted-userOp no-retry fix
(`af380b7da`), the chain-id probe (`a3a241860`), and the config guards (`ea75333e8`, `2a56d5864`).

- [ ] **9.1 Rapid-fire overlap** — start a publish, then immediately vote on something else.
      Both land, in order. No `AA25` nonce error, no duplicate op.
- [ ] **9.2 Tab-switch mid-flight** — repeat 9.1 but switch tabs away and back during the
      publish. The queued vote must still go through (the queue is module-level per EOA, so it
      survives react-query refetches).
- [ ] **9.3 Queue timeout is retry-safe** — if an op sits >45 s behind a slow publish and errors,
      the message must be the **"Nothing was submitted — safe to retry"** one, and retrying must
      not produce a duplicate vote.
- [ ] **9.4 Receipt-wait resilience** — on a slow block, an op should not error before ~90 s, and
      any error names the userOp hash and warns not to resubmit.
- [ ] **9.5 Reverted op does not retry** — trigger a guaranteed revert (e.g. vote on a closed
      proposal). The error surfaces **once**; the console must not show repeated submissions
      burning sponsored ops. This is the fix that stopped a reverted op from being re-sent on
      the exponential schedule.
- [ ] **9.6 Chain-id probe** — point `NEXT_PUBLIC_GEOGENESIS_RPC_TESTNET` at a *different*
      chain's RPC and attempt a write. It must fail **before signing**, with a chain-mismatch
      message. Revert the env var afterward.
- [ ] **9.7 Missing chain id** — unset `NEXT_PUBLIC_CHAIN_ID` and start the app. It must **refuse
      to boot / throw**, not silently default to testnet. Restore afterward.
- [ ] **9.8 Half-configured mainnet** — set `NEXT_PUBLIC_CHAIN_ID=80451` without the mainnet
      contract addresses. `geo-network.ts` must throw rather than fall back to testnet
      addresses. Restore afterward.
- [ ] **9.9 Legacy external-wallet login** — log in with an account that has only an external
      wallet linked. Privy `createOnLogin: 'all-users'` creates an embedded wallet and the
      smart account initializes. (Previously bricked with `smartAccount = null`.)
- [ ] **9.10 Fresh space during indexer lag** — open a just-created space before it indexes. The
      page renders the empty entity and self-heals on a later load. Crucially, **no edit attaches
      to a synthetic `id=spaceId` entity** — that fallback is gated behind
      `NEXT_PUBLIC_IS_TEST_ENV`.

---

## Read-path spot checks (fast, do these anywhere in the run)

The v2 GraphQL migration rewrote most queries and deleted `fragments.ts`, `fetch-subspaces`,
`fetch-tab`, `fetch-spaces-where-editor`, `fetch-entity-type`, `fetch-parent-entity-id`.

- [ ] **R1** Space page tabs render and navigate.
- [ ] **R2** Sidebar counts (members / editors / proposals) are non-zero and correct.
- [ ] **R3** Entity page with a **dangling relation** still renders — the decoder now drops the
      bad relation instead of failing the whole entity (`dc0be86a3`).
- [ ] **R4** Explore feed cards render.
- [ ] **R5** Your profile's proposals list (`fetch-proposals-by-user`) is populated.
- [ ] **R6** A space with executed + rejected proposals shows correct status chips.

## Known issues — expected failures, do not file as regressions

- **Bricked accounts** (preflight P1): every write reverts `0xa54aed6d` `SpaceNotActive()`.
  Backend: the indexer kept the orphaned row after `overrideSpaceId` reassigned the account.
  App-side mitigation is still **unimplemented** — `getSpaceByAddress` matches two rows
  case-insensitively and takes `spaces?.[0]` with no ordering.
- **Pre-migration executed proposals show REJECTED** in the v2 API (missing execution events).
  Backend gap, not UI.
- **Expired proposals read "Pending execution"** (5.10) — the REST schema drops `executeBy`.

## Not covered here

- Local-dev anvil / `geo-migration-e2e` stack (superseded by public staging).
- Mainnet chain 80451 behavior beyond the config guards in 9.7/9.8 — there is no mainnet
  deployment to test against yet, and the geo-sdk still ships no mainnet config.
