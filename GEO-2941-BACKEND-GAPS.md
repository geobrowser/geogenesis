# GEO-2941 — status

Branch: `feat/geo-2941-debate-rooms-ui`, four commits on `upstream/master`.

**The blocker is gone.** geo-chat [#135](https://github.com/geobrowser/geo-chat/pull/135) gives a
room a `rematch_session_id`, created on first join. GEO-2941 is buildable end to end.

## Backend, as it stands

| PR | What | State |
|---|---|---|
| [#125](https://github.com/geobrowser/geo-chat/pull/125) | Room schema and access rules | Merged |
| [#126](https://github.com/geobrowser/geo-chat/pull/126) | Room HTTP surface, presence, sweeper | Merged |
| [#127](https://github.com/geobrowser/geo-chat/pull/127) / [#129](https://github.com/geobrowser/geo-chat/pull/129) / [#131](https://github.com/geobrowser/geo-chat/pull/131) | Scheduled request lifecycle — creates rooms | Merged |
| [#135](https://github.com/geobrowser/geo-chat/pull/135) | **A room's debate-again session** | Merged |

## Frontend, built

- `/debate/{roomId}`, rendering the debate-again picker from the room's session.
- Access off `access.status` in the body: `not_a_participant` and `closed` redirect to
  `/explore?modal=room-access`, `not_yet_open` says when the door opens, only a missing room is a
  404.
- Presence keyed by a per-tab `connection_id`, leaving on unmount and on `pagehide`.
- Six indicator states off the server's `waiting` reason and `occupants`.
- State 3 opens the mic and enables Request debate. Both are the whole behaviour change the ticket
  specifies, and both are covered by a test that fails when the fix is removed.
- Join prompt off `/me/debate-rooms`, an offer with a per-session snooze, suppressed in a room.
- The coordinator's auto-push is gated on the room path, which also fixes the stale-`activity`
  bounce.

2126 tests pass, `tsc` and `eslint` clean.

---

## Gap 0 — a room's session dies 90 seconds into an ordinary wait — BLOCKING

`expire_offline_rematch_sessions` (`crates/api/src/db_debates.rs`) expires any `browsing` session
where **either** party has been offline for 90 seconds. A room's session is `browsing`, and waiting
for someone who has not arrived is exactly "the other party is offline".

So the session dies about 90 seconds after the first person walks in — while the room itself is
still counting down a **10 minute** no-show grace (`NO_SHOW_GRACE`), or **20** if the opponent is
busy elsewhere. `ensure_room_session` returns the stored id forever and never mints a replacement,
so the room is unusable for the rest of its window: voice unmounts, and Request debate and claim
changes both 400 with `rematch_not_browsing`.

The client cannot paper over this. It can refuse to eject the viewer, which it does, but it cannot
give them back a working room.

Asked for: exempt room-held sessions from that sweep, or mint a replacement on join. The room
already owns the timing decision — two grace periods, both far longer than 90 seconds — so the
generic rematch rule should not also apply.

## Three further gaps — none blocking

### 1. No participant names

`participants` and `occupants` are `Uuid[]`, and the client has no user-id to profile lookup —
`getDebateProfile` keys on profile space id. So the indicator says "Your opponent" rather than a
name.

Ask: participant summaries on the room view, the shape every other debate payload uses.

### 2. No gateway event

`crates/debates/src/events.rs` has no room event, so nothing invalidates on a join or a leave. The
client polls every 3s while the tab is visible, which is the mechanism rather than a backstop —
up to 3s of lag on the state two people are watching for each other on.

Ask: `debate.room_changed`, audience the two participants, mirroring
`debate_rematch_changed_event`.

### 3. "They left" is client memory

`DebateRoomView` reports who is in the room, never who has been, so state 4 (left) and state 5
(never came) are the same payload until the grace period expires. Worked around with this visit's
memory of having seen the opponent in `occupants`; it does not survive a refresh.

Also blocks GEO-2887's ask to tell "left" from "disconnected".

Ask: `ever_joined` per participant. `debate_room_participants.first_joined_at` already holds it and
is already denormalised for the sweeper.

---

## Still to build on this side

- **Trap 3** — the picker still ejects on `ended`/`expired`/`converted`. Must not fire for a
  room-backed session, or a room's end dumps both users somewhere unexplained.
- **Prompt 2** — "your next scheduled debate is starting", gated on recording state. The signal is
  `/me/debate-rooms`; the gate is ours.
- **GEO-2887** — opponent-left popup, left to [geogenesis #2481](https://github.com/geobrowser/geogenesis/pull/2481).

## One Linear housekeeping item

[GEO-2946](https://linear.app/geobrowser/issue/GEO-2946) and
[GEO-2934](https://linear.app/geobrowser/issue/GEO-2934) are still marked *On Deck* with merged PRs
against them. That mismatch is what caused the confusion about what was done.
