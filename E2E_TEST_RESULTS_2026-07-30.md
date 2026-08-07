# E2E test results — `mainnet-migration-v020`

Run date: 2026-07-30  
Application: `http://127.0.0.1:3001`  
Network: Geo testnet, chain 55516  
Source plan: `E2E_TEST_PLAN.md`

## Legend

- **PASS** — acceptance criteria observed end to end.
- **PARTIAL** — core behavior worked, but one or more stated assertions were not observed.
- **FAIL** — observed behavior contradicted the acceptance criteria.
- **BLOCKED** — prerequisite account, fixture, or prior flow was unavailable.
- **NOT RUN** — runnable in principle, but not exercised in this session.

## Test data created

| Artifact | Identifier |
|---|---|
| Account A personal space | `d4bee0928fb5405baba3b1513f085835` |
| Account A profile | `4db59d71807245da9a7a6a8ca4f86f69` |
| Account B EOA | `0x81E56809C44c03de2dE485D691F8eA3Ad3A55e3b` |
| Account B personal space/profile | `804dd7a9e5794a0b8e5b8c79bd33a53c` |
| Test post | `658ab68348f24fd8922c6c0a982c4669` |
| Ranking block | `04a2642c1e9146d4add2e9f5bcd81340` |
| Created DAO | `f92786d67acd4577a7ab167df3380f0f` |
| Recovery DAO C | `34c3bdc266f64716b5e39a4b5224d8e2` |
| Recovery DAO D | `39e1b14da3fc44d6a59bb971ae2f0322` |
| Fast-path proposal | `faa54dfdff9e41f991fd21298989a3fe` |
| Review-path proposal | `54044135641f42f2a3c927457a208295` |
| Voting-settings proposal | `a137b6e5b3c74df7ba4cb078b8b25caf` |
| Recovery DAO D settings proposals | `fb6642b29c1b4425bf37bdcc8e535a1f`, `6d4ede5329b44bf39d7091fcaff2a531` |
| Account B membership proposal | `2313623261614c4c83fdacc593623f29` |

The DAO's final test state is description `Flow 4.5 review path verification.` and voting settings `25h / 51% / 100% / fast pass 1 / quorum 1`.

## Executive summary

The wallet, personal-space writes, media uploads, comments, rankings, entity voting, DAO creation, DAO publishing, and voting-settings round trip mostly worked. The highest-risk failures are the DAO topic/subspace write paths, which failed before creating proposals and repeatedly retried failed transactions. The retry loop was stopped by navigating away.

Other notable mismatches were a false onboarding timeout, missing ranking “Add new,” `flat=0` being rejected instead of warned, missing active/countdown and vote-choice UI, review proposals auto-applying without an Execute step, profile-proposal presentation defects, and a Home crash on a pending governance-settings proposal.

## Results by checklist item

### Preflight

| ID | Result | Evidence |
|---|---|---|
| P1 | **PASS** | Fresh Privy embedded-wallet account was used; writes succeeded. |
| P2 | **PASS** | Indexer block `18821` matched RPC head `0x4985` (`18821`) at preflight. |
| P3 | **PASS** | Browser console was captured throughout. No smart-account initialization failure was seen. |

### Flow 1 — Signup, personal space, first content

| ID | Result | Evidence |
|---|---|---|
| 1.1 | **PASS** | Embedded wallet login completed without a gas prompt or smart-account initialization failure. EOA shown as `0x5D6d0E45D76D360AB4F94941CE9a005b0AEa2ebD`. Cookie internals were not inspected. |
| 1.2 | **FAIL, reproduced on both accounts** | Account A reported `Account setup failed: Timed out waiting for personal space to index.` and self-healed one second later. Account B reproduced the same console timeout before its pending link resolved successfully to `804dd7a9…a53c`. This is a recurring premature failure/timeout race. |
| 1.3 | **PASS** | Created and published `E2E First Post 2026-07-30`; hard reload retained name, description, type, author, and date. Transaction `0x8ea49d3446bcebb51c8547f82f2ef254f200079d24fedf3c25ce26a81bb97c58`. |
| 1.4 | **PASS** | Account B was reloaded while its personal-space link was `/space/pending/b65cd3d8…604b`. The same pending ID resumed, writes stayed disabled as `Finishing account setup…`, and exactly one personal space later resolved as `804dd7a9e5794a0b8e5b8c79bd33a53c`. |

### Flow 2 — Personal-space content writes

| ID | Result | Evidence |
|---|---|---|
| 2.1 | **PASS** | Image CID `QmUMtHxu5AVWGTvPHxUT5xM6CReFmh931tF2VeJTSPKm6V` rendered after hard reload. |
| 2.2 | **PASS** | Video CID `QmVTYQ2nqJqeAnmtaPt8BVhxcDt5gKvs2V2b1SzKPpVo3Y` and keyframe CID `QmX8BWDW51bZ4JMAriaFMzzsftvFbKvu6wssFLGptQ8PYg` rendered after reload. The video intentionally replaced the prior image block. |
| 2.3 | **PASS** | Cover CID `QmV7JA9tXgNVnGqbuo97JX4GxJ2Av44EGWgeWAc4t3m3wL` persisted across reload and rendered in responsive variants. |
| 2.4 | **PASS** | Comment published on a standard entity and persisted after reload. Post pages themselves did not render a comments section, which is a separate page-specific gap. |
| 2.5 | **PASS** | Edited comment text persisted; count remained one. |
| 2.6 | **PASS** | Ranking block and ranked entry persisted after reload. |
| 2.7 | **FAIL** | No-match query `zzqvnepomxq20260730` showed an empty result with no “Add new” option. |
| 2.8 | **PASS** | Upvote persisted at `1`, switch to downvote persisted at `-1`, and withdrawal persisted at `0`. |
| 2.9 | **PASS** | Personal-space topic changed to the first Ethereum result and persisted after hard reload. Searching `AI` produced GraphQL runtime errors; Ethereum search succeeded. |

### Flow 3 — DAO creation

| ID | Result | Evidence |
|---|---|---|
| 3.1 | **PASS** | Blank field produced `All fields are required.` and disabled Save. |
| 3.2 | **PASS** | Fast-path votes `2` produced `flatSupportThreshold must be between 0 and 1 (number of initial editors)`. |
| 3.3 | **FAIL** | Fast-path votes `0` produced blocking `Fast path votes must be at least 1.` instead of a non-blocking warning. |
| 3.4 | **PASS** | Universal threshold defaulted to `100`; its DOM minimum tracked the `51` pass threshold. |
| 3.5 | **PASS** | Abandoned Day=`7` reset to Day=`1`; name and all settings reset after cancel/reopen. |
| 3.6 | **PASS** | Dialog closed immediately and one top-center `Creating …` pill appeared. |
| 3.7 | **PASS** | Duplicate submission while the first pill was present created no second pill and no second `[create-space] background deploy started` log. |
| 3.8 | **PASS, with transient failure noted** | Attempt A remained stuck for more than four minutes and never emitted a DAO-factory event. After reload, attempt B resolved in about four seconds and auto-navigated to populated DAO `f92786d67acd4577a7ab167df3380f0f`; hard reload did not 404. |
| 3.9 | **PASS** | Continuation run: DAO D deployment logged one background job, the page reloaded about 3.2 seconds later before completion, and the in-memory pill/job disappeared. The already-submitted DAO then appeared once in Editor of as `39e1b14da3fc44d6a59bb971ae2f0322`, opened as a populated page, and New Space reopened normally. No second deploy-start log appeared. |
| 3.10 | **NOT RUN** | No controlled failed job reached the retry UI. |
| 3.11 | **PASS** | Initial governance boxes were `24h / 51% / 100% / 1 / 1`. Vote duration was intentionally changed to `25h` in Flow 7. |

### Flow 4 — DAO publishing paths

| ID | Result | Evidence |
|---|---|---|
| 4.1 | **PASS** | DAO Review showed a path selector; personal-space Review did not. |
| 4.2 | **PASS** | Copy read `Only requires 1 editor…` and `review over 24 hours … 51% pass rate`. |
| 4.3 | **PASS** | Selected Review path, switched spaces, returned to DAO, and observed Fast path reset. |
| 4.4 | **PASS** | Fast-path proposal `E2E Flow 4.4 fast path` applied immediately and persisted after reload. |
| 4.5 | **PARTIAL** | Review proposal was initially open and unapplied, but UI said `Voting period open` rather than showing an Active chip and countdown. |
| 4.6 | **PASS** | Both proposals showed correct author, name, and readable description diff. |

### Flow 5 — Voting and execution

| ID | Result | Evidence |
|---|---|---|
| 5.1 | **PARTIAL** | Retested on fresh proposal `fb6642…5a1f`: vote succeeded, but captured console still rendered only `Submitting vote Object`; it did not expose a numeric `proposalVersion` as required. Source passes the field, but the console-only assertion was not verifiable. |
| 5.2 | **FAIL** | Retested on `fb6642…5a1f`: the detail tally became `100% / 0%` within 391 ms, but no `You accepted` choice chip was visible and card sinking was not observed. A later Home-origin vote changed the button itself to `Accepted`/pressed, which is not the specified chip. |
| 5.3 | **PASS** | Fresh-proposal retest reconciled to server `100% / 0%`, marked the proposal Accepted, and updated the governance boxes without reload. |
| 5.4 | **BLOCKED** | With one editor and universal threshold `100%`, the Accept vote closed and applied the proposal immediately, so Accept→Reject could not be attempted. |
| 5.5 | **FAIL (proposal-type-specific)** | With pending settings proposal `6d4ede…a531`, Home → Review proposals crashed into `Reconnecting` with `Error: Unsupported proposal type` in `PendingContentProposal`. Membership and editor-request cards both opened the correct Home-origin detail routes and accepted votes successfully, so those variants pass; the settings-proposal crash remains. |
| 5.6 | **PASS** | Home → My proposals listed `6d4ede…a531`; opening its card preserved `from=home&returnSearch=tab%3Dmy`, exposed voting controls, and Accept succeeded with the button changing to `Accepted`/pressed. |
| 5.7 | **FAIL** | No Execute button appeared. The accepted review proposal auto-applied its edit. |
| 5.8 | **PASS** | Before threshold was met, Execute was hidden. |
| 5.9 | **PARTIAL, expanded** | A fresh settings proposal `067605f9f17d412daf9812c0f60ade3a` received a Reject vote and correctly remained active (`2h 59m remaining`) rather than being counted as finalized rejection. Home → My proposals showed Pending `1`, Accepted `9`, Rejected `0`; voted proposals showed Accepted `12`, Rejected `0`, matching observed states. A short-duration finalized Rejected fixture and separate not-started fixture are still missing. |
| 5.10 | **NOT RUN** | No expired `executeBy` fixture was available. |
| 5.11 | **NOT RUN** | No version-bumped stale proposal fixture was available. |

### Flow 6 — Membership and editorship

| ID | Result | Evidence |
|---|---|---|
| 6.1 | **PASS** | Fresh Account B requested membership in DAO `f927…f0f`. Transaction `0x0626979054b917095eec9f6bbbacf78766fc8094d73697b3830957e042a9bef7` created proposal `231362…3f29`; after reload the page showed `Requested · Under vote` and the sidebar showed `Membership pending`. |
| 6.2 | **PASS** | Account A opened membership proposal `231362…3f29` from Home → Review proposals and accepted it. Within the reconciliation window the proposal became Accepted and the DAO member count changed from 1 to 2 without reload. |
| 6.3 | **PARTIAL / FAIL (fast path UI)** | Account B was confirmed as the second member. Its review-path edit published successfully as proposal `4c4e8c7a844343ec872d208e261e2c6d` (`E2E B member review path`) and appeared as `Voting period open`. The UI also offered Fast path even though new-member fast-path access is disabled; that submission reverted during simulation with selector `0x3a9c66d4`, decoded from the DAO ABI as `FastPathRestricted()`. The deterministic revert was retried seven times over about 17 seconds before the error modal appeared. |
| 6.4 | **PASS** | As B, `Request editorship` created proposal `3034b9d9c32a487cb9f6755c5076a87a`; `Requested · Under vote` and `Editorship pending` survived reload. Account A opened the editor card from Home, voted Accept, and after reload the proposal was Accepted and the DAO count changed from 1 to 2 editors. |
| 6.5 | **PASS** | Account A used Manage editors to create editor-removal proposal `3a8eb9fe80f141ceaa13c53146788f34`. A's first Accept left it open with 1 of 2 editors voting; B's second Accept immediately executed it, and reload persisted 1 editor. A then used Manage members to create member-removal proposal `80c015c4f3c3488ba1d3b1e379b714f4`; A's Accept immediately executed it, and reload persisted 1 member. Both proposal cards showed readable target/action titles and Accepted state. |
| 6.6 | **NOT FINISHED — stopped by request** | The fresh-request rejection pass was not run because it requires additional A/B login switching, which the user asked to stop. Earlier membership acceptance, editorship acceptance, editor removal, and member removal were completed; only the new-request Reject path and its counters remain unverified. |

### Flow 7 — Governance settings

| ID | Result | Evidence |
|---|---|---|
| 7.1 | **PASS** | As outsider Account B, the DAO governance page exposed no `Edit space governance` action/menu. |
| 7.2 | **PASS** | Editor form prefilled current on-chain values. |
| 7.3 | **PASS** | Abandoned Day=`7` reset to on-chain Day=`1`. |
| 7.4 | **PASS** | Blank Day showed inline required-field validation and disabled submission. |
| 7.5 | **FAIL** | Fast-path votes `0` was a blocking error, not an orange warning with enabled submit. |
| 7.6 | **PASS** | Footer offered Review path only. |
| 7.7 | **PASS, with refresh defect** | Continuation run captured the modal's visible `Proposal submitted` state and observed its automatic close. The governance list still did not show the new card until a hard reload. |
| 7.8 | **PASS** | Proposal detail showed named fields and readable Vote duration `1d` → `1d 1h`. |
| 7.9 | **PARTIAL** | Retests applied multiple settings round trips, including the original DAO's `25h → 26h → 27h` during concurrency coverage; metadata updated to the new on-chain value after voting/reload. No separate Execute button was exposed; application was automatic. |

### Flow 8 — Subspaces and DAO topics

| ID | Result | Evidence |
|---|---|---|
| 8.1 | **FAIL** | Related-space proposal never appeared. At least 125 `Failed to update subspace relationship … TransactionWriteFailedError` messages and 125 React `onClick object` errors were emitted over about one minute. Navigating away stopped the loop. |
| 8.2 | **BLOCKED** | No active subspace could be created. |
| 8.3 | **BLOCKED** | No active subspace existed to remove. |
| 8.4 | **FAIL** | Ethereum DAO-topic proposal never appeared. About 39 `Failed to update space topic … TransactionWriteFailedError` messages were emitted before navigation stopped the attempt. |

### Flow 9 — Resilience and negative paths

| ID | Result | Evidence |
|---|---|---|
| 9.1 | **NOT RUN** | A rapid proposal-then-vote attempt succeeded, but the proposal click awaited its receipt before the vote began, so it was sequential and does not satisfy the same-tab overlap assertion. |
| 9.2 | **PARTIAL / PASS at UI boundary** | Two signed-in tabs launched a governance-settings proposal and a vote simultaneously with `Promise.all`. Both click promises fulfilled in 1,589 ms total; proposal `6302e461a0f74af191e852d6d8dadb28` was created, concurrent vote target `56cf637c68104d9e9e9bd91829f85fcb` became Accepted, DAO Vote duration updated to `26h`, and both tabs had zero console errors/`AA25`. Explicit foreground focus switching and distinct userOp-hash capture were not instrumented, so those clauses remain. |
| 9.3 | **NOT RUN** | No deterministic queue delay was available. Note: current source comments/code use a 120-second queue wait, while the plan expects 45 seconds. |
| 9.4 | **NOT RUN** | No deterministic slow-receipt RPC was available. |
| 9.5 | **PASS for vote hook; other hooks still fail** | Exact closed-proposal test: proposal `6302e461a0f74af191e852d6d8dadb28` was loaded in two tabs, accepted/executed in one, then the stale Accept control was clicked in the other. Over 12.3 seconds the stale tab logged exactly one `Vote failed: RPC Request failed` error, no repeated submissions, and reconciled away the stale controls. Separate Flow 8 and member Fast-path hooks still retry deterministic failures dozens/seven times respectively. |
| 9.6 | **NOT RUN** | Requires a secondary app instance with a wrong-chain RPC. |
| 9.7 | **PASS** | Continuation run: an isolated process with `NEXT_PUBLIC_CHAIN_ID` removed failed immediately with `NEXT_PUBLIC_CHAIN_ID is not set` and explicitly stated there is no default. The focused Vitest guard also passed. `apps/web/.env.local` was not edited. |
| 9.8 | **PASS** | Continuation run: an isolated process targeting chain `80451`, with mainnet RPC/API present but both contract addresses empty, failed in `geo-network.ts` with `Chain 80451 has no built-in contract addresses`. No testnet-address fallback occurred and `apps/web/.env.local` was not edited. |
| 9.9 | **BLOCKED** | No legacy external-wallet-only account was available. |
| 9.10 | **PARTIAL** | The newly created DAO auto-navigated and rendered without a synthetic-entity error, but the pre-index direct-open window was not captured. |

### Read-path checks

| ID | Result | Evidence |
|---|---|---|
| R1 | **PASS** | Space tabs rendered and navigated. |
| R2 | **PASS** | Root showed 5 editors and 19 members; created DAO showed 1 editor and 1 member. |
| R3 | **NOT RUN** | No known dangling-relation entity fixture was identified. |
| R4 | **PASS** | Explore feed populated and paginated. |
| R5 | **PASS, with presentation defects** | Continuation run: Account A's profile → Proposals rendered all three authored DAO proposals. The governance-settings row displayed `Update governance settings for null`, and each row showed the raw DAO space ID instead of its name. |
| R6 | **PASS** | Governance rendered accepted/rejected status chips on existing spaces; created DAO rendered its accepted cards correctly. |

## Additional observations

- The continuation browser session reopened signed out (`Sign in to vote`), so the remaining wallet-dependent phases require Account A to be signed in again before they can proceed.
- Home rendered the pending Account B membership proposal with a nonsensical negative countdown (`-19h -44m remaining`) even though the proposal detail said `Voting period open`.
- After switching from Account A to B, the edit review panel initially selected A's stale `Ethereum` draft context and reported `3 edits / 2 entities / 2 spaces` while showing no reviewable changes. Explicitly selecting the intended DAO prevented cross-account draft contents from being submitted, but account-scoped draft/review state is not being cleared reliably.
- Local browser repeatedly logged `[DebateRecordingUploadCoordinator] could not resolve user: TypeError: Failed to fetch`; this appears unrelated to the tested write paths.
- The topic query `AI` emitted GraphQL runtime errors rather than a clean no-results response.
- Ranking pages emitted existing `Value has no data for dataType DATETIME` warnings for unrelated entities.
- Cover-image reload emitted a Next.js LCP advisory only.
- The new DAO creation attempt A stalled before any factory event; attempt B succeeded quickly with identical defaults.

## Plan for remaining E2E coverage

### Phase 0 — Stabilize the test environment

1. Keep Account A and DAO `f92786d67acd4577a7ab167df3380f0f` for regression checks.
2. Create a fresh Account B, complete personal-space onboarding, and record its EOA, personal-space ID, and profile ID.
3. Obtain or create a legacy external-wallet-only account for 9.9.
4. Identify fixtures for:
   - an entity with a known dangling relation (R3),
   - an expired proposal with `executeBy` in the past (5.10),
   - a version-bumped/re-proposed proposal (5.11).
5. Use a unique run suffix for every entity, DAO, and proposal. Capture timestamp, URL, transaction/userOp hash, proposal ID, and console logs for every write.
6. Do not rerun 8.1 or 8.4 until the failed-write retry loop and invalid status-bar `onClick` value are fixed or guarded; navigating away was required to stop the current loop.

### Phase 1 — Close timing and retry gaps

1. **1.4 completed:** Account B resumed the same pending ID after reload and resolved to exactly one personal space.
2. **3.9 completed:** DAO D proved the submitted-space/reload clause and appeared exactly once without wedging New Space.
3. **3.10:** Use a controlled, reversible failure after job creation. Verify one failed status, one Retry action, and that Retry revives only the current job.
4. **7.7 completed:** The success state and automatic close were captured; file the separate stale-governance-list refresh defect.
5. **9.10:** Capture the new DAO space ID from the receipt, open it directly before index completion, verify the empty/self-healing page, and inspect the eventual entity ID.

### Phase 2 — Account B, membership, and multi-editor governance

Run Flow 6 in order:

1. Completed: B requested membership and `Requested · Under vote` survived reload.
2. Completed: A accepted proposal `2313623261614c4c83fdacc593623f29` from Home and the member count reconciled to 2.
3. Completed with defect: B's review-path edit created proposal `4c4e8c7a844343ec872d208e261e2c6d`; Fast path was incorrectly offered and reverted as `FastPathRestricted()` with seven retries.
4. Completed: B requested editorship in proposal `3034b9d9c32a487cb9f6755c5076a87a`; A accepted it and the DAO persisted 2 editors.
5. Completed before the request: 7.1 confirmed B could not see Edit space governance.
6. Completed: editor-removal proposal `3a8eb9fe80f141ceaa13c53146788f34` and member-removal proposal `80c015c4f3c3488ba1d3b1e379b714f4` both executed; final counts persisted at 1 editor / 1 member.
7. Deferred by user request: the fresh membership request/rejection path requires more account switching. Do not resume unless a second persistent signed-in session becomes available.

Keep at least two editors for the remaining Flow 5 tests. With two editors, one vote is below the 100% universal threshold, so the proposal can remain open long enough to test vote replacement.

### Phase 3 — Complete Flow 5 with deterministic proposals

1. Create a dedicated DAO or settings profile with a one-minute vote duration, pass threshold 51%, universal threshold 100%, quorum 1, and two editors.
2. Create separate proposals for each UI surface; do not reuse one proposal for multiple tests.
3. **5.1–5.4:** From proposal detail, capture a serialized numeric `proposalVersion`, Accept with A, observe the choice chip and card order, wait for reconciliation, then change A to Reject while B has not voted.
4. **5.5:** Fix the Home `Unsupported proposal type` crash, retest the editor variant, then run the member variant with B.
5. **5.6 completed:** The authored-proposal Home path navigated with return context and its vote succeeded.
6. **5.7:** For manual execution, cast only one accepting vote in the two-editor DAO, wait for the short voting window to end, then verify Execute appears and applies the diff exactly once.
7. **5.8:** Keep a second proposal below quorum and verify Execute remains absent.
8. **5.9 partially completed:** an active proposal with a Reject vote and multiple Accepted fixtures now reconcile correctly with Home counters. Create a short-duration finalized Rejected proposal plus a separate not-started fixture to finish the full state mix.
9. **5.10:** Use the expired fixture and verify one permanent `CanNotExecute` result while documenting the known `Pending execution` UI gap.
10. **5.11:** Load version N, bump the proposal to N+1 elsewhere, then cast from the stale page and verify the stale toast plus modal close.

### Phase 4 — Retest Flow 8 after write-path repair

1. Add instrumentation that logs one submission attempt, destination registry, action, proposal ID, and decoded revert name without retrying reverted operations.
2. Set a Related or Verified subspace and verify one proposal is created.
3. Vote/apply it and verify both the relationships dialog and subtopic gallery after reload.
4. Remove the same relationship and verify the reverse round trip.
5. Propose an Ethereum DAO topic, vote/apply it, hard reload, and verify current topic plus associated-space counts.
6. During every step, assert the console contains at most one submission for a reverted userOp and no React `onClick` type error.

### Phase 5 — Resilience harness for Flow 9

1. Run secondary local app instances on isolated ports so the primary authenticated run is not disturbed.
2. Add a controllable RPC/bundler proxy or test hook that can delay queue start, submission, and receipt polling independently.
3. **9.1:** Still needed: the rapid sequential browser attempt did not create true same-tab overlap. Publish and immediately vote with instrumentation that proves queue overlap, ordering, unique userOp hashes, and no `AA25`.
4. **9.2 partially completed:** simultaneous cross-tab proposal/vote succeeded with no console errors or `AA25`; rerun with foreground focus switching and userOp-hash capture to close the remaining assertions.
5. **9.3:** Delay the first operation beyond the configured queue limit. Reconcile the plan's 45-second expectation with the code's current 120-second limit before running. Verify the second operation never submitted and is safe to retry once.
6. **9.4:** Allow submission but delay the receipt beyond normal latency. Verify no premature failure and that any timeout names the userOp hash with a do-not-resubmit warning.
7. **9.5 completed for voting:** the exact stale closed-proposal vote emitted one failure and did not retry; retain the separate retry defects in the Flow 8 and publish hooks.
8. **9.6:** Start an isolated testnet-configured instance pointed at a different chain RPC; attempt a harmless write and require a pre-signing chain mismatch.
9. **9.7:** Completed in the continuation run: the isolated unset-chain process and focused regression test both failed closed as expected.
10. **9.8:** Completed in the continuation run: the isolated half-configured mainnet process rejected missing addresses without a testnet fallback.
11. **9.9:** Log in with the legacy external-wallet-only account and verify embedded-wallet creation plus smart-account initialization.

### Phase 6 — Read paths and cleanup

1. Run R3 against the dangling-relation fixture and confirm the page renders while omitting only the bad relation.
2. R5 population is now confirmed. Follow up on the remaining presentation defects: `null` in the settings-proposal title and raw space IDs instead of space names.
3. Recheck R1, R2, R4, and R6 after membership and Flow 8 changes.
4. Restore the test DAO's intended baseline governance settings if it will be reused.
5. Confirm no pending jobs, retry loops, local drafts, or unresolved proposals remain unless intentionally retained as fixtures.

## Exit criteria for the remaining run

- Every **NOT RUN** or **BLOCKED** item above has a recorded result.
- Every **PARTIAL** item is rerun with its missing assertion captured.
- Flow 8 failures produce at most one failed submission and a usable retry/error state.
- Account B membership/editorship transitions and counts agree after hard reload.
- Flow 5 demonstrates first vote, reconciliation, vote replacement, Home variants, manual execution, gating, stale version, and expiry using separate deterministic proposals.
- Environment guard tests run in isolated processes and leave `apps/web/.env.local` unchanged.
