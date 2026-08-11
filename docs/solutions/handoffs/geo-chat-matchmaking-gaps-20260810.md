# geo-chat backend handoff — GEO-2514 gaps after the response-derived cutover

**Date**: 2026-08-10
**Audience**: geo-chat backend dev/agent
**Linear**: GEO-2514 (side panel matchmaking lobby), GEO-2430 (request popup rework)
**Supersedes nothing** — this is an addendum to
[`geo-chat-matchmaking-backend-20260806.md`](./geo-chat-matchmaking-backend-20260806.md), which
was written against the pre-cutover (client-sent position) model. Where the two disagree, this
document wins.

**geo-chat baseline audited**: branch `feat/debate-matchmaking-requests`, commit `de6c0c2`
("feat(debates): request-based matchmaking with user blocks"), which sits on `eb213ef` (PR #34,
response-derived positions). All `file:line` anchors refer to `de6c0c2`.

**geogenesis baseline**: PR #2113 (`83cf5a1df` on master) + the matchmaking hub branch
`debates-side-panel-matchmaking`.

---

> **Resolved 2026-08-10 by geo-chat `139fe19`** ("feat(debates): live matchmaking hub updates and
> readiness-aware claim cards"). All three gaps below are closed, verified against the code:
> the `Matchmaking` subscription variant exists and is cleaned up on disconnect; both events are
> emitted from the shared invalidation helpers, with `emit_requests_changed` covering create,
> accept, withdraw, dismiss (via advance/expire), auto-advance, single expiry, the sweeper, and
> readiness withdrawal; and all four readiness fields are on both matchmaking payloads. The §4
> expiry-sweeper question is answered too — `expire_pending_debate_requests` runs on the existing
> debate-lifecycle ticker and emits `requests_changed`. `cargo check --workspace` is clean and the
> `geo-debates` + `gateway_hub` tests pass. The client consumes all of it as of
> `debates-side-panel-matchmaking`. Kept for the rationale; **no action remains**.

## 0. Verdict first

`de6c0c2` is right. It is built on the response-derived model, positions come from
`debate_claim_readiness` and never from the client, request creation snapshots the requester's
validated position + `response_kind`, and accept revalidates both parties against Gaia under lock
before seating. All ten routes match the client's paths and methods, and **every response struct
matches the client's TypeScript field-for-field** — `DebateRequest`, `DebateRequestParty`,
`DebateMatchmakingPresence`, `MatchmakingClaim` (`Option<bool>` ↔ `boolean | null`),
`MatchmakingClaimsResponse` (`skip_serializing_if` ↔ optional `facets`),
`DebateRequestActionResponse` (`r#match` → `"match"`), `DebateBlocksResponse`, the create/dismiss
bodies, the `mine`/`debate_now` filter values, and `DebateActivity`'s new `outbound_request` +
`incoming_request_count`. Migration 0031 is sound: DB-enforced one-pending-outbound unique index,
`attempted_recipient_ids` for auto-advance, `online_since` backfilled from `last_seen_at`.

Three gaps remain, below. Gap 1 is a user-visible bug today. Gap 2 means the hub does not live
update. Gap 3 blocks the client from rendering the new readiness model at all.

---

## 1. The `matchmaking` gateway scope does not exist → clients get a false "paused" banner

**Severity**: user-visible bug the moment the capability is advertised.

`ResourceSubscription` (`crates/gateway/src/protocol.rs:103-113`) has only `Space` and `Debate`:

```rust
#[serde(tag = "scope", rename_all = "snake_case")]
pub enum ResourceSubscription {
    Space { space_id: String },
    Debate { debate_id: Uuid },
}
```

The client holds a `matchmaking` scope for exactly as long as the hub panel is open, so presence
fan-out stays narrow — it sends:

```json
{ "v": 1, "op": "SUBSCRIBE", "payload": { "scope": "matchmaking" } }
```

At `crates/api/src/routes/gateway.rs:412-424` that fails `serde_json::from_value::<GatewaySubscription>`
and the server replies `ERROR { code: "malformed_command" }`. The client's ERROR handler has no
branch for that code, so it falls through to the catch-all and sets `degraded + paused`
(`apps/web/core/debates/debate-gateway.ts:244-254`).

**Effect**: opening the hub shows a permanent, false *"Live debate updates are paused while
reconnecting"* banner, sticky until the next reconnect. Invalidations keep working (`paused` is a
UI signal; `readyForDebates` is untouched), so this is cosmetic — but it is wrong and it is on
every hub open.

**Asks**:

1. Add a `Matchmaking` variant to `ResourceSubscription` and `GatewaySubscriptionKey`, accepting
   `{"scope":"matchmaking"}` with no further fields. It is account-scoped — the subscriber is the
   authenticated session, so there is no id to validate and no permission check beyond "must be
   authenticated". Reject it for anonymous sessions.
2. Confirm it in the READY `subscriptions` list like any other scope. The client re-sends retained
   scopes on reconnect and reconciles every hub query when it sees the scope confirmed, so
   round-tripping it in READY is what makes reconnect recovery work.

If you would rather not add the scope, say so and the client will drop the retention — but then
§2's events must be account-scoped (they already are) and delivered without a subscription.

---

## 2. The hub does not live update — `debate.requests_changed` / `debate.matchmaking_changed` are never emitted

**Severity**: the panel silently shows stale data while open.

The new code reuses the existing invalidation events —
`emit_activity_and_claims_for_users(&mut tx, [user_id, recipient_user_id])`
(e.g. `crates/api/src/db_debates.rs:7921` in `create_debate_request_as`) — which emit
`debate.activity_changed` and `debate.claims_changed`. A grep of the whole workspace finds no
`debate.requests_changed` and no `debate.matchmaking_changed`.

The client maps `debate.activity_changed` → the activity + profile families only, and
`debate.claims_changed` → the **space-scoped** `['debates','claims',spaceId,…]` family. The hub's
four query families are account-scoped and match neither:

| Client query family | Key | Invalidated today? |
| --- | --- | --- |
| Requests list | `['debates','account',key,'requests']` | ❌ |
| People tab | `['debates','account',key,'people']` | ❌ |
| Claims tab | `['debates','account',key,'matchmaking-claims',filters]` | ❌ |
| Matches tab | `['debates','account',key,'matches']` | ❌ |
| Activity (badge, popup gate) | `['debates','account',key,'activity']` | ✅ via `activity_changed` |

**Effect**: the navbar badge and the incoming-request popup gate *do* update live, because they
read `incoming_request_count` / `outbound_request` off activity. But the contents of the Requests,
Matches, Claims, and People tabs do **not** refresh while the panel is open — a withdrawn request,
a newly available opponent, or a second incoming request will not appear until the user closes and
reopens the panel.

**Asks** — the client already implements both handlers, including the `sections` narrowing, so
emitting these is the whole fix:

```jsonc
// 1. Any change to a user's outbound or incoming request set.
//    Deliver to both parties (requester + every affected recipient, including the
//    previous recipient on auto-advance). Client invalidates: requests, activity, profile.
{ "event_type": "debate.requests_changed", "payload": {} }

// 2. Any change to matchmaking discovery data.
//    `sections` is an optional narrowing hint; omit it to invalidate all three.
{ "event_type": "debate.matchmaking_changed",
  "payload": { "sections": ["people", "claims", "matches"] } }   // any subset
```

Suggested emission points, all alongside the existing `emit_activity_and_claims_for_users` calls:

| Trigger | Event | `sections` |
| --- | --- | --- |
| request created / withdrawn / dismissed / accepted / expired / exhausted / auto-advanced | `requests_changed` | — |
| readiness enabled or disabled (join/leave queue, `remove_intent`, response withdrawal or kind change) | `matchmaking_changed` | `["claims","matches"]` |
| presence transition (online/offline, `available_to_debate`, entering/leaving a debate) | `matchmaking_changed` | `["people","matches"]` |
| block created or removed | `matchmaking_changed` | `["people","claims","matches"]` — plus `requests_changed` if it cancelled a pending request |

`matchmaking_changed` only needs to reach sessions holding the `matchmaking` scope (§1);
`requests_changed` is account-scoped and should reach the affected users regardless of scope, since
the coordinator's popup depends on it with the panel closed.

---

## 3. `MatchmakingClaim` / `MatchmakingMatch` cannot express the readiness model

**Severity**: blocks the client from rendering hub claim cards correctly. This is the one that
needs an API change rather than plumbing.

Post-cutover, a claim card is no longer "pick For or Against". It is:

1. show the viewer's **on-chain response** with the right vocabulary — Agree/Disagree when
   `response_kind = 'stance'`, Verify/Dispute when `'veracity'`; and
2. offer a **readiness toggle**, enabled only once an active indexed response exists, and explained
   when it is disabled.

The current payloads (`crates/api/src/routes/debates.rs:1136-1172`) carry only `viewer_position`:

```rust
pub struct MatchmakingClaim {
    pub claim: DebateClaimSummary,
    pub topics: Vec<MatchmakingTopic>,
    pub viewer_position: Option<bool>,
    pub positions: Vec<DebateClaimPositionSummary>,
    pub score: f64,
    pub active_debate: bool,
}
```

There is no `response_kind`, so the client cannot choose the label vocabulary, and no readiness
state, so it cannot render or explain the toggle.

**Ask**: add the same three fields `DebateClaim` already exposes on
`GET /spaces/{id}/debate-claims` (PR #2113), to **both** `MatchmakingClaim` and `MatchmakingMatch`:

```rust
pub response_kind: DebateResponseKind,             // "stance" | "veracity"
pub viewer_debate_ready: bool,
pub readiness_disabled_reason: Option<String>,
```

Ideally also promote `viewer_position` to the same shape `DebateClaim` uses, so one client
component can render both surfaces without a translation layer:

```rust
pub viewer_response: Option<ViewerResponse>,       // { position: bool, position_label: String }
```

If `viewer_response` lands, `MatchmakingClaim.viewer_position` becomes redundant — keep it only if
something else depends on it. On `MatchmakingMatch`, `viewer_position` is currently non-optional
(a match implies a validated position), which is fine to preserve.

---

## 4. Confirmations and trivia

- **Topics are correctly modelled as KG-resident.** `MatchmakingTopic` is documented as always
  empty with no topic facets published (`routes/debates.rs:1128-1134`), and `topic_id` is accepted
  but never narrows (`1149-1159`). The client resolves topic labels from the knowledge graph over
  the loaded pages. This is the right split — no change wanted. The client has removed its dead
  topic filters accordingly.
- **`in_debate` doc drift.** The backend documents it as "active match, debate, **or rematch
  session**" (`crates/debates/src/lib.rs`); the client comment says "match or debate". The backend
  is authoritative; the client comment is being corrected. No behavior change.
- **Request TTL is 25 minutes** (`now() + interval '25 minutes'`). The client renders a
  server-clock-synchronized countdown and hides requests locally the instant they expire, so any
  TTL works — but it does rely on §2's `requests_changed` to *remove* them authoritatively.
- **Expiry sweeping**: the client hides expired requests locally, but nothing tells other sessions.
  Confirm a sweeper transitions `pending` → `expired` and emits `requests_changed`; otherwise a
  request that expires with no other activity lingers in `incoming_request_count` until the next
  unrelated activity event.

---

## 5. Suggested order

1. §1 scope variant — small, and it stops a visible false banner.
2. §2 events — the hub is not really live without them.
3. §3 payload fields — coordinate with the client conversion, which is in flight on
   `debates-side-panel-matchmaking`; until they land the hub claim cards cannot show readiness.

Advertise `debate_matchmaking_v1` only once §1–§3 are live: the client flips its whole
position/readiness UX on that capability.

---

## 6. Open, 2026-08-11 — the Matches tab returns nothing

Reported from manual testing: two users, opposing positions on the same claim, both ready, and
`GET /matchmaking/matches` returns `{ "matches": [] }` for both. Two candidate causes, both
server-side. The client renders whatever the endpoint returns and applies no filter of its own
unless the user picks a space, so an empty tab means an empty response.

### 6.1 Auto-pairing is still live, and it eats the match

`try_match_user_from_saved_preferences` still runs on preference upsert, gateway heartbeat, and
availability-enable. The moment both users are ready on a claim the server pairs them into a
`DebateMatch`. An in-match user is not eligible, so the opposite side's `available_now_count`
falls to 0 and the claim drops out of `/matchmaking/matches` **for both of them** — the pairing
consumes the very match the tab exists to show.

This is already specified as deleted:
[`docs/plans/2026-08-06-feat-geo-2514-matchmaking-lobby-plan.md:176`](../../plans/2026-08-06-feat-geo-2514-matchmaking-lobby-plan.md)
and acceptance criterion 7 ("Preference upsert / heartbeat / availability-enable no longer create
matches"). Please confirm whether it landed; the symptom says it did not.

Symptom to check it by: a match prompt appears without either user having sent a request.

### 6.2 The eligibility predicate may be wrong in either direction

The product spec, restated by the client owner on 2026-08-11, is:

> This tab should only include claims that **you have set your intention to debate** and there are
> other people online who have the **opposite position and also have set their intention to
> debate**.

That is stricter on both sides than §6.2 of the
[2026-08-06 handoff](./geo-chat-matchmaking-backend-20260806.md), which this supersedes:

| | 2026-08-06 handoff | Product spec (authoritative) |
|---|---|---|
| Caller | has a *position* | has a position **and** debate intent on the claim |
| Opposite side | `available_now_count ≥ 1` — online, available, not in a debate, unblocked | the same **and** debate intent on the claim |

So `available_now_count` must count only opposite-position holders who are **debate-ready on that
claim**, not merely online and available. If it currently counts the looser set, the Claims tab
overstates who is matchable; if the matches query instead requires something the spec doesn't,
it under-returns. Please state which predicate is implemented so the client copy can match it.

No client change is possible for either item.
