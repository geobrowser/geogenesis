# geo-chat backend handoff — GEO-2514 matchmaking lobby

**Date**: 2026-08-06
**Audience**: geo-chat backend dev
**Linear**: GEO-2514 (side panel matchmaking lobby), GEO-2430 (request popup rework)
**Frontend**: fully implemented and merged-ready on `geogenesis` branch
`bryan/geo-2514-introduce-side-panel-matchmaking-lobby`. Client wire types live in
`apps/web/core/debates/api.ts` (the "Matchmaking hub (GEO-2514)" block) and are the
authoritative contract this document restates.
**geo-chat baseline audited**: commit `2666013` (2026-08-05). All `file:line` anchors below
refer to that commit.

---

## 1. Product summary

Replace auto-pairing matchmaking with **explicit, targeted debate requests**:

- Setting a position on a claim ("intent") **no longer pairs you with anyone**.
- A user browses matchable claims/people in a side panel and sends a **debate request** on a
  specific claim. The server picks the recipient: the **longest-online** eligible user holding the
  opposite position.
- Requests live **~25 minutes**, one **outbound at a time** per user. If the recipient dismisses
  (or blocks), the same request **auto-advances** to the next candidate. Accepting creates the
  match + ready debate atomically — the existing debate lifecycle from `ready` onward is untouched.
- Users can **block** each other: mutual invisibility everywhere in matchmaking.

## 2. Deploy ordering — the capability switch

The client is already shipped and **capability-gated**. It flips from the legacy queue flow to the
request flow only when the gateway READY frame advertises:

```
debate_matchmaking_v1
```

(alongside the existing `debate_invalidations_v1`, `crates/api/src/routes/gateway.rs:50`).

Until then the client keeps calling the legacy queue endpoints and renders "Matchmaking isn't
available yet." in the new panel (all new endpoints 404 → graceful empty state, `retry: false`).
**Any deploy order works.** Advertise the capability only when everything in §5–§8 is live.

## 3. What already exists (do not rebuild)

| Existing piece | Anchor | Reused as-is |
|---|---|---|
| `debate_claim_preferences`, uniquely keyed `(user_id, claim_entity_id)` — positions are already global per claim | schema | The "intent" store. No new endpoint needed: `PUT …/debate-preference` sets, `DELETE …/debate-queue` clears (already doesn't cancel an active match/debate). |
| Availability/presence in `debate_user_activity` + `debate_presence_leases` (90s lease) | `db_debates.rs:1418` | Presence source for candidate eligibility. |
| Eligibility predicate: online + available + no active match/debate/rematch + past cooldown | `AVAILABLE_DEBATE_CLAIM_PARTICIPANTS_QUERY`, `db_debates.rs:64-117` | Template for candidate selection. |
| `DebateMatch` + `Debate('ready')` creation, expiry sweepers, lifecycle scheduler | `db_debates.rs:1097`, `db_debates.rs:4261` | Accept produces these; everything downstream unchanged. |
| `debate.activity_changed` fan-out to affected users | `emit_activity_and_claims_for_users`, `db_debates.rs:352` | Carries all request-state invalidations (§8). |
| `DebateChallenge` (claimless, 2-min, from profile) | `db_debates.rs:3448` | Unchanged. Debate requests are a **separate** concept — claim-bound, 25-min, auto-advancing. |

**Not reusable, tempting trap**: do *not* model pending requests as pending `DebateMatch` rows.
Match creation sets `active_match_id` on **both** users (`db_debates.rs:4283`), which removes them
from everyone else's matchmaking. A pending request must not lock the recipient out — they stay
visible and can receive other requests. New table.

Also not reusable: `debate_claim_pair_blocks` is a post-debate rematch cooldown keyed
`(claim, user_pair)` (`db_debates.rs:1361`) — unrelated to user blocking.

## 4. Behavior change — delete auto-pairing

Remove the automatic pairing when `debate_matchmaking_v1` ships. It currently fires from three
places:

1. Inline in `upsert_global_debate_preference` (`db_debates.rs:4300` — the availability check +
   candidate insert in the same tx).
2. `update_debate_presence_for_user` → `try_match_user_from_saved_preferences`
   (`db_debates.rs:1486`).
3. `set_debate_availability_for_user` → `try_match_user_from_saved_preferences`
   (`db_debates.rs:1585`).

After this, `PUT …/debate-preference` / `POST …/debate-queue` still upsert the preference and emit
`debate.claims_changed`, but always return `match: null`. Matches are created only by request
accept (and challenges/rematches, unchanged).

## 5. Schema (migration `0027`)

```sql
-- When the user last transitioned offline→online. Requests target the
-- candidate with the OLDEST online_since ("online longest").
ALTER TABLE debate_user_activity ADD COLUMN online_since timestamptz;
-- Set it in recompute_debate_presence_aggregate (db_debates.rs:1493), which
-- already detects the false→true transition via `was_online`.

CREATE TABLE debate_user_blocks (
    blocker_user_id uuid NOT NULL REFERENCES users (id),
    blocked_user_id uuid NOT NULL REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_user_id, blocked_user_id),
    CHECK (blocker_user_id <> blocked_user_id)
);

CREATE TYPE debate_request_status AS ENUM
    ('pending', 'accepted', 'dismissed', 'withdrawn', 'expired', 'exhausted');

CREATE TABLE debate_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    status debate_request_status NOT NULL DEFAULT 'pending',
    debate_claim_id uuid NOT NULL REFERENCES space_debate_claims (id),
    requester_user_id uuid NOT NULL REFERENCES users (id),
    requester_position boolean NOT NULL,
    -- Current target. Mutates on auto-advance; id and expires_at do not.
    recipient_user_id uuid NOT NULL REFERENCES users (id),
    -- Recipients already tried (dismissed / blocked / went ineligible), so
    -- auto-advance never re-targets someone who already said no.
    attempted_recipient_ids uuid[] NOT NULL DEFAULT '{}',
    turn_format_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL          -- created_at + 25 min, immutable
);

-- One pending outbound per user, enforced by the database, not the app:
CREATE UNIQUE INDEX debate_requests_one_pending_outbound
    ON debate_requests (requester_user_id) WHERE status = 'pending';
CREATE INDEX debate_requests_pending_recipient
    ON debate_requests (recipient_user_id) WHERE status = 'pending';
```

## 6. New endpoints

Auth, error envelope, and RFC3339 timestamps as existing. All routes require a session. Shared
shapes (`DebateParticipantSummary`, `DebateClaimSummary`, `DebateMatch`, `Debate`) are the existing
serializations from `crates/debates/src/lib.rs`.

```jsonc
// DebateMatchmakingPresence — embedded in people and request parties
{ "online": true, "available_to_debate": true, "in_debate": false,
  "online_since": "2026-08-06T14:00:00Z" }

// DebateRequest
{
  "id": "…", "status": "pending",
  "claim": DebateClaimSummary,
  "requester": DebateParticipantSummary + DebateMatchmakingPresence
               + { "position": true, "position_label": "For" },
  "recipient": /* same shape; current target */,
  "turn_format_id": null,
  "created_at": "…", "expires_at": "…"
}
```

### 6.1 `GET /matchmaking/people`

`{ "people": DebatePerson[] }` where `DebatePerson` = `DebateParticipantSummary` +
`DebateMatchmakingPresence` + `{ "can_challenge": bool }`.

Everyone online **and** `available_to_debate`, excluding the caller and anyone blocked in either
direction. Sort `online_since` asc (longest online first). Cap at ~200, no paging.
`can_challenge` = no pending challenge between the pair (same rule as
`create_debate_challenge`, `db_debates.rs:3469`).

### 6.2 `GET /matchmaking/matches`

`{ "matches": MatchmakingMatch[] }`:

```jsonc
{
  "claim": DebateClaimSummary,
  "viewer_position": true,
  "positions": [        // DebateClaimPositionSummary, one per side
    { "position": true, "position_label": "For",
      "total_count": 4,           // everyone with this position, online or not
      "available_now_count": 2,   // eligible RIGHT NOW (block-filtered vs caller)
      "participants": [ /* ≤3 DebateParticipantSummary for avatar stacks */ ] },
    { "position": false, ... }
  ]
}
```

Claims where the **caller has a position** AND the opposite side has `available_now_count ≥ 1`.
"Available now" = the eligibility predicate of `db_debates.rs:88-104` plus not-blocked-either-way
against the caller. Sort: opposite `available_now_count` desc, then opposite `total_count` desc.

Note the client type also declares optional `topics` — return `[]` or omit; the client resolves
topic labels from the Knowledge Graph itself. **No KG lookups needed anywhere in this work.**

### 6.3 `GET /me/debate-requests`

```jsonc
{ "outbound": DebateRequest | null, "incoming": DebateRequest[] }
```

- `outbound`: the caller's single pending request, else null.
- `incoming`: pending, unexpired requests targeting the caller, excluding any where the requester
  is offline or blocked either way. A requester who is *in a debate* **is included** with
  `requester.in_debate = true` — the UI shows "unavailable until free" rather than dropping it.

### 6.4 `POST /debate-requests`

Body `{ "space_id": "…", "claim_entity_id": "…", "format_id"?: "standard" }` → `DebateRequest`.

- Requester's position = their saved `debate_claim_preferences` row for the claim
  (400 `intent_missing` if none).
- Recipient = eligible opposite-position holder with **oldest `online_since`**, excluding blocks
  both ways. None → 409 `no_candidates_available`.
- Pending outbound already exists → 409 `outbound_request_exists` (the partial unique index makes
  the race impossible to persist).
- Caller under `cooldown_until` → `cooldown_active`.
- `expires_at = now() + interval '25 minutes'`.

### 6.5 `POST /debate-requests/{id}/withdraw`

Requester only. `pending → withdrawn`. Response (shared by 6.5–6.7):

```jsonc
{ "request": DebateRequest, "match": DebateMatch | null, "debate": Debate | null }
```

### 6.6 `POST /debate-requests/{id}/accept`

Recipient only. Body `{ "format_id"?: … }`. **Atomically, one transaction**:

1. `pending → accepted` (guard `status = 'pending' AND expires_at > now()`).
2. Create the `DebateMatch` with **both participants already `accepted`** and the `Debate` in
   `ready` — the same rows challenge-accept produces (`accept_debate_challenge`,
   `db_debates.rs:3521` is the template).
3. Set both users' `active_match_id`/`active_debate_id`; emit activity + claims for both.

If the requester became ineligible (offline, entered a debate, withdrew, blocked): 409
`requester_unavailable`, request unchanged. The client shows both users the ready room directly
from their activity snapshot — no second accept round-trip.

### 6.7 `POST /debate-requests/{id}/dismiss`

Recipient only. Body `{ "remove_intent"?: bool }`.

- Append the recipient to `attempted_recipient_ids`, then **auto-advance**: re-target the *same
  request id* to the next-oldest-`online_since` eligible candidate not yet attempted.
  `expires_at` never changes. No candidate left → `status = 'exhausted'`.
- `remove_intent: true` additionally deletes the recipient's preference row for the claim
  (GEO-2430's "I don't want to debate this claim").
- The client's "Not now" button is **client-only** — it never calls this endpoint; the request
  simply stays in the recipient's list.

### 6.8 `GET /me/debate-blocks` · `PUT /me/debate-blocks/{user_id}` · `DELETE /me/debate-blocks/{user_id}`

All return `{ "blocked": DebateParticipantSummary[] }` (the caller's full block list).
`PUT` is idempotent; blocking yourself is a 400.

Block side effects, same transaction as the `PUT`:
- Any pending request **between the pair, in either direction**: if the blocked party is the
  recipient, auto-advance it (as 6.7); if they're the requester, remove the target and advance —
  the requester never learns why.
- Thereafter the pair is mutually invisible in people/matches/incoming and skipped in candidate
  selection.

### 6.9 Sweeper

Extend the lifecycle scheduler (pattern: `expire_pending_debate_matches`, `db_debates.rs:1097`):

- `pending AND expires_at <= now()` → `expired`.
- Optional but recommended: when a pending request's **requester** drops offline (presence
  expiry, `db_debates.rs:759`), advance/expire so recipients don't see dead requests — the client
  also filters requester-offline defensively.

Each transition emits activity for every affected user (§8).

## 7. `DebateActivity` additions

Two fields on the existing snapshot (`crates/debates/src/lib.rs:387`):

```rust
pub outbound_request: Option<DebateRequest>, // caller's pending outbound
pub incoming_request_count: i64,             // pending, unexpired, visible incoming
```

`incoming_request_count` must apply the same visibility filter as `GET /me/debate-requests`
(it drives the navbar badge; the client only fetches the full list when it's > 0).
The client types both as optional, so shipping activity first is safe.

## 8. Gateway

- **Capability**: add `debate_matchmaking_v1` to the READY capability list
  (`routes/gateway.rs:50` and `:945`) — last thing to flip, see §2.
- **Events**: none required. Every request/block mutation and sweeper transition must emit
  `debate.activity_changed` for each affected user via the existing outbox
  (`emit_activity_and_claims_for_users`) — the client refetches requests off that signal.
- Optional v2 (client already handles it if present, fine to skip): scope
  `{ "scope": "matchmaking" }` + event `debate.matchmaking_changed` with
  `{ "sections"?: ["people"|"claims"|"matches"] }`, throttled ~1/10s per connection, to make the
  open panel's People/Matches live. Without it the client refetches on open/interval.

## 9. Error codes the client handles

| Code | Status | Meaning |
|---|---|---|
| `intent_missing` | 400 | `POST /debate-requests` without a saved position on the claim |
| `outbound_request_exists` | 409 | A pending outbound already exists |
| `no_candidates_available` | 409 | No eligible opposite-position candidate |
| `cooldown_active` | 4xx | Existing cooldown semantics |
| `requester_unavailable` | 409 | Accept raced requester withdrawal/offline/debate/block |

Anything else falls through to the client's generic error toast. A 404 on any §6 route is the
"backend not deployed yet" signal — keep that true until launch.

## 10. Explicitly out of scope (client covers it or v2)

- ~~**`GET /matchmaking/claims`** deferred~~ **Update 2026-08-07: implemented after all** —
  server-side search, space + position filters, keyset cursor over
  `(matchable_count, total_count, updated_at, id)`, and first-page `facets.space_ids`. It returns
  `topics: []` and `score: 0`, and accepts-but-ignores `topic_id`, per the next bullet. The client
  resolves topic labels/filtering from the KG over loaded pages.
- Topic labels and claim scores — KG-resident; client resolves them.
- The matchmaking gateway scope (§8, optional v2).
- Any change to debate lifecycle, recordings, media, rematches, or challenges.

## 11. Testing

Follow the existing database-backed test pattern in `db_debates.rs` (e.g.
`debate_availability_is_idempotent_and_controls_pools_and_matching`, `db_debates.rs:8122`), gated
by `RUN_DATABASE_BACKEND_TESTS=1`. Cases the frontend depends on:

1. Create → recipient is the oldest-`online_since` eligible opposite; blocked/ineligible users
   never selected.
2. One-pending-outbound enforced under concurrent creates (the partial index, not app logic).
3. Dismiss advances the same id, preserves `expires_at`, never re-targets an attempted recipient,
   `exhausted` when the pool empties; `remove_intent` deletes the preference row.
4. Accept: atomic request/match/debate creation, both participants `accepted`, debate `ready`,
   both activities updated; `requester_unavailable` on the race; expired requests unacceptable.
5. Block: bidirectional invisibility in people/matches/incoming + immediate advance of in-flight
   requests in both directions.
6. Sweeper expiry emits activity for both parties.
7. Preference upsert / heartbeat / availability-enable **no longer create matches**.
8. `incoming_request_count` matches the visibility-filtered list.

## 12. Suggested implementation order

1. Migration `0027` + `online_since` maintenance.
2. Blocks endpoints (self-contained, needed by everything else's filters).
3. Request CRUD + candidate selection + auto-advance + sweeper.
4. Atomic accept (crib from `accept_debate_challenge`).
5. `DebateActivity` fields + activity emission on every transition.
6. People + matches read endpoints.
7. Remove auto-pairing (§4).
8. Advertise `debate_matchmaking_v1` → the shipped UI lights up with no frontend deploy.

Steps 1–6 are safe to deploy incrementally at any time; 7 and 8 must land together.
