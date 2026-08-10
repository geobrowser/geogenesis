# GEO-2514 — Side panel matchmaking lobby

Branch: `bryan/geo-2514-introduce-side-panel-matchmaking-lobby`
Related: GEO-2430 (incoming-request popup rework)
Frontend paths relative to `apps/web/`. Backend is [geobrowser/geo-chat](https://github.com/geobrowser/geo-chat) (private Rust repo), audited at commit `2666013` (2026-08-05).

---

## 1. What this replaces

Matchmaking today is a **per-space, auto-pairing queue**. Setting a position on a claim
(`POST …/debate-queue` or `PUT …/debate-preference`) silently pairs you with the first online
user holding the opposite position and pops `DebateMatchPrompt`. You never choose who you debate.

GEO-2514 replaces that with an explicit, global **matchmaking hub**: a right-hand side panel opened
from a navbar icon, with **Requests / Matches / Claims / People** tabs, an availability toggle,
targeted debate requests (~25-min expiry, server-side auto-advance to the next candidate, one
outbound at a time), and user blocking.

### Locked decisions

| Decision | Choice |
|---|---|
| Backend scope | **Contract-first.** Define the full geo-chat contract as an executable TS spec; wire the frontend fully to it. No mock layer. |
| Matchmaking model | **Replace auto-match.** Setting a position no longer pairs anyone. Debates start only via explicit targeted requests. |
| GEO-2430 popup | **In scope** for this ticket. |
| Feature flag | **Existing `useDebatesEnabled()`.** No new flag. |

Figma (file `iWKsYButqqKWd1bqeBrUUj`): People `74941:121927`, Claims `74928:117842`,
Matches `74928:116114`, Requests `74853:401984`, popup `74793:14271`.

---

## 2. Frontend status — implemented and verified

All code is on the branch, uncommitted. 16 modified files (+878/−47) plus 20 new files under
`core/debates/matchmaking/` and `design-system/icons/megaphone.tsx`.

### Verification (all green)

- `tsc --noEmit` — clean
- `eslint core/debates atoms partials/navbar design-system/icons/megaphone.tsx app/entry.tsx` — clean
- `prettier --check core/debates/matchmaking` — clean
- `vitest run` — **1991 tests passing** (367 in `core/debates`)
- `next build` — exit 0; dev server boots and serves 200

### New files — `core/debates/matchmaking/`

| File | Role |
|---|---|
| `hooks.ts` | All 13 query/mutation hooks. Holds `{ scope: 'matchmaking' }` while the panel is open. |
| `debates-hub-panel.tsx` | Portal panel. Desktop `fixed top-11 right-0 bottom-0 w-[min(400px,100vw)]` (below the h-11 navbar, no scrim); mobile framer-motion bottom sheet. Escape + capture-phase outside-pointerdown close. Header + availability toggle + tabs. |
| `use-debates-hub.ts` | `{ isOpen, activeTab, open, close, toggle, setTab }` over `debatesHubAtom`. |
| `debates-hub-button.tsx` | Navbar megaphone pill + incoming-request badge. |
| `hub-states.tsx` | `HubMessage`, `HubQueryState`, `HubSkeleton`, `isMatchmakingUnavailable` (404 → "Matchmaking isn't available yet."). |
| `hub-filter-menu.tsx` | Shared filter dropdown. |
| `people-tab.tsx` | Online roster + Debate button (reuses the existing challenge flow). |
| `claims-tab.tsx` | Search, space/topic/position filters, infinite paging. Exports `SpaceTopicFilters`. |
| `matchmaking-claim-card.tsx` | Claim card with position buttons + avatar stacks. Exports `SpaceChip`. |
| `matches-tab.tsx` | Sticky `OutboundRequestCard`, intent toggle, "Request debate". |
| `requests-tab.tsx` | Incoming cards + claimless-challenge card. |
| `incoming-request-card.tsx`, `outbound-request-card.tsx`, `request-parties.tsx`, `request-overflow-menu.tsx` | Request card composition. |
| `incoming-request-popup.tsx` | GEO-2430 modal. |
| `use-request-countdown.ts` | Server-clock-corrected expiry countdown. |

### Modified files

- **`core/debates/api.ts`** (+329) — new types + fetchers; `DebateActivity` gains optional
  `outbound_request` / `incoming_request_count`.
- **`core/debates/hooks.ts`** — exports `debateQueryNetworkOptions`; adds account-scoped query keys
  `people`, `matchmakingClaims(filters)`, `matches`, `requests`, `blocks`.
- **`core/debates/debate-gateway.ts`** (+89) — `matchmaking` scope, two new event cases, READY
  `capabilities` exposed on the snapshot, `useDebateMatchmakingSupported()`.
- **`core/debates/debate-request-dialog.tsx`** — three optional props (`rejectLabel`,
  `tertiaryAction`, `overflowMenu`) so GEO-2430's popup reuses the layout instead of duplicating it.
- **`core/debates/debate-coordinator.tsx`** — renders `IncomingRequestPopup`; request fetching gated
  on `incoming_request_count > 0` so idle sessions make no extra calls.
- **`core/debates/match-prompt.tsx`** (+30) — see §2.1.
- **`core/debates/claim-debate-button.tsx`** (+67), **`browse/join-debate-panel.tsx`** — capability-gated
  queue→intent migration.
- **`atoms/index.ts`**, **`partials/navbar/navbar-client-actions.tsx`**, **`app/entry.tsx`**,
  **`design-system/icons/megaphone.tsx`**.

### 2.1 The ready-room gap (non-obvious fix)

An accepted request produces a `DebateMatch` where **both participants are already `accepted`** and
**neither tab holds an ownership record** — nobody went through the accept dialog. The old
`initialOwnershipState` read that as "accepted in another tab" and stranded *both* users.

`match-prompt.tsx` now detects a fully-accepted match and races for the Web Lock, so the first tab
enters the ready room:

```ts
if (participantAccepted && isFullyAcceptedMatch(ownershipMatch)) {
  setOwnershipState('checking');
  void ownershipCoordinator.acquire().then(acquired => {
    if (!active) return;
    if (!acquired) { setOwnershipState('other-tab'); return; }
    ownershipCoordinator.beginAcceptance();
    setOwnershipState(ownershipCoordinator.confirmAcceptance() ? 'confirmed' : 'other-tab');
  });
}
```

The hub's accept mutation deliberately does **not** acquire ownership itself — two coordinators in
one tab would contend for the same lock. Both requester and recipient resolve through this one path.

> Untestable in CI: jsdom has no Web Locks API, so `acquire()` always succeeds and lock contention
> can't be modeled. Needs a manual two-tab pass once the backend is up.

---

## 3. What works end to end today (no backend change)

- **The hub shell** — navbar button, open/close, desktop panel vs. mobile sheet, Escape/outside
  click, tab switching, sign-in empty state.
- **The availability toggle** — existing `PUT /me/debate-availability`; stays in sync with the old
  navbar toggle.
- **The claimless-challenge card** in Requests — existing `activity.challenge` +
  `POST /debate-challenges/{id}/reject`.
- **People tab's Debate button** — existing `POST /debate-challenges`. The button works; the roster
  it sits in is empty (new endpoint).
- **Setting a position** from `ClaimDebateButton` / `JoinDebatePanel` — unchanged. The queue→intent
  switch is gated on the gateway advertising `debate_matchmaking_v1`, so the legacy auto-pairing
  flow keeps working until the backend deploys. **No lockstep release required.**
- **Graceful degradation** — every hub query 404s and renders "Matchmaking isn't available yet."
  with `retry: false`.

Dormant but complete: the incoming-request popup (gated on a field the server doesn't send yet) and
the ready-room claim above.

---

## 4. geo-chat audit — what actually exists

Read from the Axum route table (`crates/api/src/lib.rs:328-510`) and `crates/api/src/db_debates.rs`.

> ⚠️ The geo-chat README's "Debate API" section is **stale** — it documents no challenges at all and
> its `DebateActivity` sample omits the `challenge` field that's been in the struct for a while.
> Treat the code as authoritative.

| Need | Present? | Evidence |
|---|---|---|
| Online-people roster | **No** | No people/roster route exists. Presence lives in `debate_user_activity`, only ever queried filtered by claim (`AVAILABLE_DEBATE_CLAIM_PARTICIPANTS_QUERY`, `db_debates.rs:64`). |
| Cross-space claim discovery | **No** | Only `GET /spaces/{space_id}/debate-claims`, optionally filtered by `claim_ids`. Zero `ILIKE`/`to_tsvector` in the crate — no text search. No topics, no score. |
| Position without auto-pairing | **Partly** | `PUT …/debate-preference` does exactly this, then calls `try_match_user_from_saved_preferences` (`db_debates.rs:4154`), which pairs you with the first opposite-position user. |
| Targeted debate request | **No** | `DebateMatch` is server-chosen; `DebateChallenge` is claimless and 2-minute (`db_debates.rs:3501`). |
| Blocking a user | **No** | `debate_claim_pair_blocks` exists but is a post-debate cooldown keyed `(claim, user_pair)`, written by `complete_debate_and_block_pair` (`db_debates.rs:1361`). Unrelated. |

### Key schema facts discovered

- **`debate_claim_preferences` is uniquely keyed `(user_id, claim_entity_id)`** — positions are
  already **global per claim**, not per space. Cross-space discovery is feasible on the existing
  schema; no endpoint exposes it.
- **`DELETE …/debate-queue` already clears the preference** without cancelling an active match or debate.
- **`DebateMatch` sets `active_match_id` on both users** (`db_debates.rs:4283`), removing them from
  everyone else's matchmaking.
- **`emit_activity_and_claims_for_users` already fans out `debate.activity_changed` to both parties**
  on challenge create (`db_debates.rs:3516`).
- **There is no `online_since` column.** `debate_user_activity` has `last_seen_at` and `is_online`
  only.
- **Score and topics don't exist in geo-chat.** Both are KG-resident: topics via
  `TOPICS_PROPERTY_ID` (`core/claims/ontology.ts:4`), score via `SCORE_SYSTEM_PROPERTY`
  (`core/constants.ts:11`).

---

## 5. Scope cuts identified by the audit

The original contract asked for 11 route paths and 2 gateway events. Four items were over-asks:

### Cut 1 — drop `PUT/DELETE …/debate-intent` (2 endpoints)

Since preferences are already global per claim, "intent" is just "preference minus auto-pairing."
Reuse `PUT …/debate-preference` and `DELETE …/debate-queue`. The backend work becomes a **deletion** —
remove the `try_match_user_from_saved_preferences` call at its three sites (preference upsert,
gateway heartbeat, availability-enable).

**Client change:** repoint `useSetDebateIntent` / `useClearDebateIntent` in `matchmaking/hooks.ts`.

### Cut 2 — drop `debate.requests_changed` (1 event)

`debate.activity_changed` already fans out to both parties on request-shaped mutations. If request
state rides on `DebateActivity` — which `outbound_request` / `incoming_request_count` already do —
the existing event covers it.

**Client change:** remove the case in `debate-gateway.ts`; the `requests` key invalidates alongside activity.

### Cut 3 — drop `topics` and `score` from `MatchmakingClaim`

Neither exists in geo-chat; both are KG-resident, and `browse/join-debate-panel.tsx` already resolves
topics client-side with `useQueryEntities` over a batch of claim entity ids. Otherwise we'd be
teaching a Rust chat backend the KG ontology to render a chip.

**Trade-off (accepted):** score becomes a within-page tiebreaker instead of a global sort key. It's
the *third* sort key — behind available-now count and total positions, both of which geo-chat owns —
so the impact is marginal. **This is a deliberate deviation from the ticket's stated sort.**

### Cut 4 — consider deferring the `matchmaking` scope + `debate.matchmaking_changed`

The only new gateway plumbing in the ask. It buys live updates to People/Matches while the panel is
open. Refetch-on-open plus a while-open interval gets most of it for zero backend work; the event can
be added in v2 without a client rewrite.

### Rejected: merging requests into `DebateMatch`

Tempting — matches already have targeted pairs, positions, per-participant `accepted`, and an expiry
sweeper. But creating one sets `active_match_id` on **both** users, removing them from matchmaking.
A pending request must *not* lock the recipient out; they stay visible and can receive other
requests. Different invariant → separate table.

---

## 6. Revised geo-chat contract

**9 route paths**, down from 11, plus one deletion. Auth/error envelope as existing; timestamps RFC3339.

### Endpoints

| # | Method + path | Request | Response | Notes |
|---|---|---|---|---|
| 1 | `GET /matchmaking/people` | — | `{ people: DebatePerson[] }` | Online **and** available, excluding self + blocked-either-way. Sorted `online_since` asc. Capped (~200), no paging. |
| 2 | `GET /matchmaking/claims` | query: `search?`, `space_id?`, `topic_id?`, `filter?=all\|mine\|debate_now`, `cursor?`, `limit?=20` | `MatchmakingClaimsResponse` | Server-side search + sort: (1) Σ`available_now_count` desc, (2) Σ`total_count` desc. `mine` = viewer has a position; `debate_now` = opposite side available now. |
| 3 | `GET /matchmaking/matches` | — | `{ matches: MatchmakingMatch[] }` | Viewer position ∩ ≥1 available-now opposite holder (block-filtered). Same sort. |
| 4 | `GET /me/debate-requests` | — | `DebateRequestsResponse` | Incoming excludes expired / offline-requester / blocked. `requester.in_debate = true` is **included** — UI shows a pending-until-free state. |
| 5 | `POST /debate-requests` | `{ space_id, claim_entity_id, format_id? }` | `DebateRequest` | Position taken from viewer's saved preference. Recipient = online-longest eligible opposite. Starts the expiry clock. Errors: `outbound_request_exists` 409, `no_candidates_available` 409, `intent_missing` 400, `cooldown_active`. |
| 6 | `POST /debate-requests/{id}/withdraw` | — | `DebateRequestActionResponse` | Requester only → `withdrawn`. |
| 7 | `POST /debate-requests/{id}/accept` | `{ format_id? }` | `DebateRequestActionResponse` | Atomically: request→`accepted`, creates `DebateMatch` (both participants `accepted`) + `Debate('ready')`; both users' activity carries match + debate. Existing ready/joined/abort endpoints untouched. Error `requester_unavailable` on race. |
| 8 | `POST /debate-requests/{id}/dismiss` | `{ remove_intent?: boolean }` | `DebateRequestActionResponse` | Recipient only. Server auto-advances the **same request id** to the next candidate (recipient mutates, expiry unchanged); no candidates → `exhausted`. `remove_intent: true` also clears the recipient's position. **"Not now" is client-only** — no call, request stays in the Requests tab. |
| 9 | `GET/PUT/DELETE /me/debate-blocks[/{userId}]` | — | `{ blocked: DebateParticipantSummary[] }` | Symmetric invisibility everywhere, including candidate selection. Pending requests between the pair advance immediately. |

**Deleted behavior:** remove `try_match_user_from_saved_preferences` from preference upsert, gateway
heartbeat, and availability-enable. `POST/DELETE …/debate-queue` stays as the position-clear route.

### Schema additions

- `debate_user_activity.online_since timestamptz` — set on the false→true transition in
  `recompute_debate_presence_aggregate`, which already detects it via the `was_online` parameter.
- New user-block table (distinct from `debate_claim_pair_blocks`).

### `DebateActivity` additions

```rust
pub outbound_request: Option<DebateRequest>,  // drives the pinned awaiting-response card
pub incoming_request_count: i64,              // navbar + tab badges without opening the panel
```

Typed as optional (`?:`) on the client until the backend ships.

### Gateway

- Advertise **`debate_matchmaking_v1`** in READY. This single string flips the client from queue to
  intent — it is the deploy-ordering switch.
- Optional (Cut 4): `debate.matchmaking_changed` on a new `matchmaking` scope, payload
  `{ sections?: ('people'|'claims'|'matches')[] }`, throttled to ~1/10s/connection.

### Irreducible server-side logic

These are behaviors, not endpoints, and nothing existing approximates them:

1. **Candidate selection** — opposite position, has a position set, online, available, not in a
   debate, not blocked either way, longest online. Needs a presence-aware index, not a query per request.
2. **Auto-advance** — dismiss/block re-targets the same request id to the next candidate, expiry
   unchanged; none left → `exhausted`.
3. **Expiry** — ~25 min from creation, fixed for the request's lifetime, with an event when it fires.
   The client counts down against server time and hides cards early on skew, but needs the event to
   actually clear them.
4. **Claims sort** — available-now count desc, then total-positions desc. Must be server-side because
   the list is paged.
5. **Block semantics** — invisibility across people/claims/matches/requests *and* candidate
   selection; pending requests between the pair advance immediately.
6. **Accept atomicity** — request→accepted, match with both participants `accepted`, debate `ready`,
   both activities updated, in one transaction, with `requester_unavailable` on the race.

### Deprecated once shipped

Server-side auto-pairing. `DebateMatch` survives only as the artifact of an accepted
request/challenge/rematch; `debate-matches/{id}/accept|decline` become unused by this client for
claim matches (still used by challenges/rematches).

---

## 7. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| 1 | Apply Cuts 1–3 to the client now? | **Yes.** Contained change to `api.ts`, `matchmaking/hooks.ts`, `debate-gateway.ts`, `claims-tab.tsx`. Shrinks what geo-chat must build before any of this lights up. |
| 2 | Defer Cut 4 (matchmaking gateway event)? | **Yes for v1.** Poll while open; add the event later without a client rewrite. |
| 3 | Accept score-as-tiebreaker instead of a global sort key? | **Yes**, unless the ticket's sort is load-bearing — the alternative is indexing the KG in geo-chat. |
| 4 | Commit the branch now or after the cuts? | After, so the contract in `api.ts` matches what's handed to the backend team. |

---

## 8. Manual QA once geo-chat ships

- Two-browser pass: send → popup → accept → **both** land in `DebatePreScreen` → debate.
- Two-tab pass on the accepting side (the Web Locks path CI can't cover).
- Dismiss → auto-advance to the next candidate.
- Withdraw; expiry at ~25 min.
- Block → mutual invisibility across all four tabs.
- One-outbound-at-a-time enforcement, including the `outbound_request_exists` race fallback.
