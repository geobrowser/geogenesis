# Regression re-test checklist

Consolidated manual test notes for everything landed on `mainnet-migration-v020` that
hasn't been hand-verified yet: the geo-sdk **0.20.0-beta.8** bump (SDK-owned gas
sponsorship) plus the still-untested items from fix **Batches 2–5** and the upstream
merge. Run top to bottom on testnet (chain 55516) unless marked local-dev.

Automated status: `tsc` clean (apps/web + packages/auth), 1,156 unit tests green.
Everything below is about on-chain / UI behavior that unit tests can't cover.

---

## A. geo-sdk beta.8 — SDK-owned sponsorship (NEW, test first)

The kernel setup is byte-identical to beta.5's; what changed is where the RPC URLs come
from. `NEXT_PUBLIC_ZERODEV_RPC_URL_TESTNET` is now unset in `.env.local`, so every
sponsored op exercises the SDK's built-in endpoint (same ZeroDev project id as before,
now with `?selfFunded=true`).

- [ ] **A1. Login / kernel init** — log in with the Privy embedded wallet. Expect no
      `[SMART-ACCOUNT] initialization failed:` in the console and the wallet-address
      cookie set to the EOA address. This is the first thing that would break if the
      new network-config plumbing were wrong.
- [ ] **A2. Publish an edit** (personal space) — sponsored `sendUserOperation` through
      the new endpoint. Expect publish completes; no gas prompt; edit indexes.
- [ ] **A3. Publish in a governance space (FAST path)** — proposal created and, in a
      flat=0 space, passes with a single editor vote (re-confirms the earlier flat=0
      behavior against the new client).
- [ ] **A4. Vote on a proposal** — sponsored vote lands; tallies refresh within ~3–30 s
      (refresh backoff timers).
- [ ] **A5. Create a DAO space** — the heaviest sponsored op (factory call). Expect
      creation succeeds and the space indexes.
- [ ] **A6. Rapid-fire overlap (wrapper regression)** — start a publish, immediately
      vote on something else. Expect both land, in order, no AA25 nonce error, no
      duplicate ops. The serialization/at-most-once wrapper was NOT changed, but this
      is the flow that depends on `sendUserOperation` + `waitForUserOperationReceipt`
      still behaving the same on the beta.8 client.
      ⚠ Known watch item (pre-existing): a vote queued behind a slow publish can hit
      the 45 s timeout in `useSmartAccountTransaction`.
- [ ] **A7. Membership / editorship request** — request membership in a space you're
      not in; optimistic "requested" state shows and survives refresh.
- [ ] **A8. (local-dev only) anvil e2e env** — `apps/web/.env` still routes
      rpc + sponsorship to `localhost:8545` via the now-optional
      `NEXT_PUBLIC_ZERODEV_RPC_URL_TESTNET`. Boot the local stack and publish once to
      confirm the override path works.

## B. Batch 2 — proposalVersion threading + vote refresh (untested)

- [ ] **B1.** Vote from the **active-proposal review window** (governance page) — vote
      targets the proposal's *current* version (check the `[VOTE]` console log shows a
      numeric `versionId`, not undefined→1).
- [ ] **B2.** Vote from **home → pending proposals** (editor + member variants).
- [ ] **B3.** Vote from **home → my governance proposals** card.
- [ ] **B4.** After any vote: tallies/status update without a manual reload (backoff
      refreshes at 3/7/15/30 s) and the "You accepted/rejected" chip persists.
- [ ] **B5.** Edge: vote on a proposal that has been **re-proposed (version bumped)**
      since page load — expect the stale-proposal toast + review window closes, not a
      raw error modal.

## C. Batch 3 — create-space validation + entity votes (untested)

- [ ] **C1.** Create-space dialog: leaving any voting-settings field empty → "All
      fields are required." (no NaN submission).
- [ ] **C2.** Out-of-range settings rejected by the SDK validator message
      (`validateVotingSettingsInput`, editor count 1).
- [ ] **C3.** flat=0 shows the warning: "fast-path proposals pass with a single editor
      vote" — but still allows creation.
- [ ] **C4.** Re-opening the dialog resets previously entered settings (no stale
      values from a cancelled attempt).
- [ ] **C5.** Entity vote buttons (rankings) still cast/toggle votes correctly after
      the objectType hardcode — counts and highlight state match before/after reload.

## D. Batch 4 — smart-account wrapper + Privy create-on-login (untested)

- [ ] **D1.** Covered functionally by A6 (serialization + at-most-once).
- [ ] **D2.** Receipt-wait resilience: on a slow block, the op should NOT error before
      ~90 s, and if it does surface an error it names the userOp hash and warns not to
      resubmit.
- [ ] **D3.** **Legacy external-wallet login** (`createOnLogin: 'all-users'`): log in
      with a user that has only an external wallet linked — an embedded wallet is
      created and the smart account initializes (previously bricked with
      smartAccount=null).

## E. Batch 5 — synthetic-home gating (untested)

- [ ] **E1.** On real testnet, open a **freshly created space** during indexer lag —
      page renders the empty entity and self-heals on later loads; no edits attach to
      a synthetic `id=spaceId` entity (gated behind `NEXT_PUBLIC_IS_TEST_ENV`).
- [ ] **E2.** (local-dev) With `NEXT_PUBLIC_IS_TEST_ENV=true` the synthetic-home
      fallback still works: publish to a bootstrap space home page and values render.

## F. Upstream merge spot-checks (untested)

- [ ] **F1.** Ranking search shows the **"Add new"** option (came in with upstream
      `f2340672e`).
- [ ] **F2.** Governance counters (Active / Accepted / Rejected) match reality for a
      space with executed, rejected, and endTime=0 proposals (Batch 1 — user-verified
      earlier, re-check once after the SDK bump since queries are unchanged but the
      page data path is shared).

---

**If A1–A5 pass, the beta.8 migration is good.** Sections B–F are the outstanding
batch verifications and are independent of the SDK bump; failures there should be
triaged against their batch commits, not the SDK.
