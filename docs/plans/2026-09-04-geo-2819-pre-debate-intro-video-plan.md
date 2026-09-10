# GEO-2819 — Both users' video on the pre-debate screen

Branch: `bryan/geo-2819-debates-show-both-users-videos-on-the-pre-debate-screen-so`

## Summary

Turn the `status === 'ready'` screen from a solo mirror into a live two-way call, so debaters can
introduce themselves before the recorded debate starts. Both sides connect to the debate's own
LiveKit room as soon as they have granted camera/mic; hitting **I'm ready** on both sides moves the
debate on exactly as it does today.

**This is a frontend-only change.** Verified against geo-chat (`crates/api/src/db_debates.rs`):

- `POST /debates/:id/livekit-token` has **no status gate** — it checks participation only
  (`db_debates.rs:4121`). A token is issuable while the debate is `ready`.
- `POST /debates/:id/joined` **rejects `ready`** with `debate_not_connecting`
  (`db_debates.rs:4243`). So the client must connect to LiveKit early but defer `/joined` until the
  status flips to `connecting`.
- `POST /debates/:id/ready` is unchanged: second `ready_at` flips `ready → connecting` and emits
  `debate.state_changed` (`db_debates.rs:4299`).
- Token TTL is 1 hour (`DEBATE_TOKEN_TTL_SECS`), which comfortably covers an unbounded intro. It
  only gates joining/rejoining, not an established session.

## How the flow works today

`apps/web/app/space/[id]/(space)/debates/[debateId]/debate-room-page-client.tsx`

| Debate status    | Screen                               | LiveKit                                                 | Recorder                                                     |
| ---------------- | ------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------ |
| `ready`          | `DebatePreScreen` (own preview only) | not connected                                           | —                                                            |
| `connecting`     | `DebateRecordingModal`               | `connect()` runs: token → connect → `/joined` → publish | —                                                            |
| `preflight` (5s) | modal                                | connected                                               | **starts** (GEO-2644: early start, head trimmed server-side) |
| `in_progress`    | modal                                | connected                                               | running                                                      |
| `thanking`       | modal                                | connected                                               | stopped, persisting                                          |

- The ready screen **already acquires camera and mic** via `ensureLocalPreview()`
  (`debate-room-page-client.tsx:1688`), so this change publishes tracks the tab is already holding.
- Auto-connect is gated by `if (debate.status === 'ready') return;` (line 1700).
- Remote ready state propagates over the debate gateway websocket
  (`debate.state_changed` → invalidate `['debates','detail',id]`, 50 ms coalesce) — **not** through
  the indexer path that makes GEO-2687 slow. Ready propagation should be sub-second.

## Target behaviour

1. Ready screen mounts → preview acquired → **connect to LiveKit immediately**, publish both
   tracks, do **not** call `/joined`, do **not** record.
2. Both mics live and both remote audio audible for the whole intro. No time limit.
3. Remote not yet present (permission not granted, still loading, dropped) → placeholder tile
   rather than an empty frame.
4. Each side hits **I'm ready**; when the second lands, the server flips to `connecting`, the
   client fires `/joined` on the connection it already holds, and the debate proceeds.
5. A status pill sits in the same position on both screens: neutral **Not recording** during the
   intro, red **Recording** once capture actually starts. It is rendered once, above both screens,
   and positioned `fixed` — an `absolute` child of these scroll containers scrolled out of view
   before the reader reached the ready button, and remounting it per screen meant its live region
   was never announced at the transition.

## Steps

### 1. Extract the shared video tile

Move `DebateVideoTile` (currently `debate-room-page-client.tsx:2485`) to
`apps/web/core/debates/debate-video-tile.tsx`, along with `recordingOverlayTextShadow` and
`recordingLabelTextShadow`. All its debate-specific props (`countdown`, `showGo`, `endTurnAction`,
…) are already optional, so the pre-screen can use it with just
`participantPosition` / `positionLabel` / `overlayText`. No behaviour change; pure move.

### 2. Make the media element bindings survive the screen swap

This is the real structural hazard. `localVideoRef` and `remoteMediaRef` are shared between
`DebatePreScreen` and `DebateRecordingModal`, and only one is mounted at a time. Today `connect()`
runs _after_ the modal mounts, so binding once inside `connect()` works. Once we connect during
`ready`, the `ready → connecting` swap unmounts the elements the tracks were attached to and the
debate would open onto two blank tiles.

- **Local:** replace `localVideoRef` with a callback ref (`setLocalVideoElement`) that assigns
  `srcObject` from `localMediaStreamRef.current` whenever a node mounts. Removes the ad-hoc effect
  in `DebatePreScreen` (lines 100–106) and the one-shot assignment in `connect()`'s `local_preview`
  stage.
- **Remote:** hoist `attachRemoteTrack` (defined inside `connect()`, line 994) to a component-scope
  `useCallback`, and give the remote container a callback ref that re-attaches everything in
  `subscribedRemoteTracksRef` when a new host node mounts — the same detach-then-reattach the
  `Reconnected` handler already does for GEO-2602 (line 1070).

_Alternative considered:_ render one component across both phases so nothing unmounts. Cleaner in
principle and better for GEO-2770, but a much larger rewrite of the modal; the callback refs get
the same correctness for a fraction of the diff.

### 3. Connect during `ready`, defer `/joined`

- `connect()`: skip the `mark_joined` stage while `debateStatusRef.current === 'ready'`. Keep the
  stage enum; just don't run it. Note that `debateRoomStagesAfterJoin` then correctly no longer
  applies to a pre-debate failure — a failed intro connect can still be rescued by the connecting
  deadline, so leave that set alone.
- Add a `markedJoinedRef` and a new effect: when `status === 'connecting'` and
  `roomState === 'connected'` and we haven't marked joined, fire `markJoined`. With both sides
  already in the room this collapses the 30 s connecting window
  (`debate_connecting_duration`) to roughly one round trip — a side benefit for GEO-2770's
  flicker complaints.
- Relax the auto-connect gate (line 1700) to allow `ready`, keeping the
  `autoConnectAttemptedRef` guard so the `ready → connecting` transition does **not** reconnect.
- Extend the two ownership/takeover status gates to include `ready`:
  `canTakeOverConnection` (line 451), `focusHandoff` / `canReleaseOwnership` (lines 611–616), and
  the auto-takeover gate (line 1330). An intro has nothing recorded, so a focused tab should be
  able to reclaim it freely.

### 4. Unmute during the intro

`shouldEnableLocalAudio` (line 2853) currently returns false for anything but your own turn. Once
`connect()` runs during `ready`, `setLocalTrackPreferences` would **mute the microphone track** —
silencing the intro _and_ breaking the existing mic-level meter, which reads the same track. Add:

```ts
if (effectiveStatus === 'ready') return true
```

(still respecting `audioMuted`). Remote audio is already enabled by default via
`remoteAudioEnabled`.

### 5. Rebuild the pre-screen layout

`apps/web/core/debates/debate-pre-join-screen.tsx`

- Two stacked `DebateVideoTile`s at the room's geometry (`max-w-[430px]`, `aspect-[5/3]`, `gap-2`),
  ordered by the same rule the room uses (`localParticipant.position === false` puts the remote
  tile first). Matching geometry means the transition into the debate changes chrome, not layout.
- Remote tile overlay states: `Waiting for <name> to join` (no LiveKit participant),
  `Waiting for video` (participant present, no video track yet), `<name> left` (participant
  disconnected). Add a `ParticipantDisconnected` handler in `connect()` — there isn't one today —
  to clear `remoteVideoReady` and drive that third state.
- Keep the opponent's `Ready` chip, moved onto their tile. Deliberately **no** nudge, countdown or
  "they're waiting for you" copy on the other side — the issue flags the pressure risk, and a
  factual chip is the least coercive form of it.
- Keep the device pickers, the mic-level meter and the "Speak to test your mic" row below the
  tiles. Deliberately **no** mic-mute or camera-off toggle: the screen exists so the two of them
  see and hear each other before the debate, and muting the person you are about to introduce
  yourself to is not a state worth supporting. Reaching it also costs the recorder its video
  track — see "Camera toggles stay `enabled`-only" below.
- Copy above the **I'm ready** button: something like _"Say hello — this part isn't recorded.
  Recording starts when you're both ready."_
- Local button states: `I'm ready` → `Waiting for <name>…` once `ready_at` is set.

### 6. Recording status pill

New `apps/web/core/debates/debate-recording-status-pill.tsx`, rendered in the same fixed position
in both `DebatePreScreen` and `DebateRecordingModal`.

Drive it off what the recorder is actually doing rather than off inferred status: add a
`capturing` state set `true` in the `MediaRecorder` `start` listener (line 665, next to the
existing `markCapturingRef.current()`) and `false` in `stopLocalRecorder` / `discardLocalRecorder`
— **and in the recorder's own `stop` and `error` events**, which is the part that is easy to miss:
`disconnectRoom` stops the local tracks, the stream goes inactive, and the recorder stops itself
without going through either function. `capturing` lives on the surface rather than the modal, so
it survives the unmount and the pill comes back red on the next connection while
`startLocalRecorder` early-returns and writes nothing.

With those, the pill reports:

| Phase              | Pill                        |
| ------------------ | --------------------------- |
| `ready` (intro)    | neutral · **Not recording** |
| `connecting`       | neutral · **Not recording** |
| `preflight` onward | red · **Recording**         |
| `thanking`         | neutral · **Not recording** |

Note the pill turns red at `preflight`, ~5 s before the first turn. That is correct — capture
genuinely starts there (GEO-2644 starts the encoder early and trims the head server-side), and
claiming otherwise would be the dishonest option.

### 7. Two consequences found while building

Both come from the same root: the room is now live while the pre-screen is still on screen, so
device choices that used to happen entirely _before_ any connection now happen over one.

- **Speaker routing.** `debateRoomOptions` applies `audioOutput` at room construction, which used
  to be after every device choice had been made. A speaker picked during the intro reached the
  picker and nothing else. Fixed by pushing the selection to the live room with
  `room.switchActiveDevice('audiooutput', …)`.
- **Camera and microphone.** `ensurePreview({ forceRestart })` stops the tracks the room is
  publishing, and nothing republishes them — the intro would carry on with a dead tile and a dead
  mic meter. Fixed by rebuilding the connection around the new devices, which is affordable
  precisely because nothing is recorded or timed during the intro. That in turn required `connect`
  to let go of a room it is still holding, since it previously only ever ran from an idle one.

### 8. Optional: instrument the intro

`capture('debate_intro_completed', { debateId, durationMs, bothPresent })` on the
`ready → connecting` transition. Cheap, and it answers the product question behind the ticket
(do people actually use the intro, and for how long).

## Risks and edge cases

- **Blank tiles after the swap.** Step 2 is the mitigation; it is also the thing most likely to be
  got wrong. Test it explicitly.
- **Recorder must not start during the intro.** It cannot today —
  `recordingWindowForDebate` returns null while `started_at` and `preflight_ends_at` are both null
  (line 3156) — but `localMediaStreamRef` will now be populated much earlier, so add a regression
  test asserting `MediaRecorder` is never constructed while `status === 'ready'`.
- **GEO-2688 (device takeover).** This does not add a _new_ device acquisition — the ready screen
  already holds camera and mic. It does extend how long the tab holds them, since the intro has no
  time limit. Honest read: the bug isn't made worse in kind, but its blast radius grows. Not a
  blocker for this work; worth landing GEO-2688 near it.
- **One participant never grants permission.** The permission state is reported inside their own
  tile (the old `PreScreenMediaUnavailable` full-screen replacement is gone), so the opponent and
  their readiness stay visible throughout; the other side sees the "waiting to join" placeholder
  and can still leave.
- **Un-ready.** There is no endpoint to clear `ready_at` (`ready_at = COALESCE(ready_at, …)`).
  Out of scope; would need a geo-chat change. If the pressure concern proves real in testing, that
  is the follow-up.
- **Long intro + token TTL.** 1 hour. An established connection outlives it; only a rejoin after
  an hour would fail. Not worth handling now, but it is the failure mode if someone reports it.
- **Ready propagation.** Rides the gateway websocket, not the indexer — so GEO-2687's 20–30 s lag
  should not apply. Verify on staging with two browsers before calling it done.

## Tests

`apps/web/app/space/[id]/(space)/debates/[debateId]/debate-room-page-client.test.tsx` already mocks
`livekit-client` (`Room`, `createLocalTracks`, event emitters) and the debate hooks — extend it:

1. `status: 'ready'` connects to LiveKit and publishes tracks.
2. `status: 'ready'` does **not** call `markDebateJoined`.
3. `markDebateJoined` fires once when the status flips to `connecting` on an existing connection,
   and `connect()` is not re-run.
4. A remote `TrackSubscribed` during `ready` renders in the pre-screen; after the flip to
   `connecting` the same track is still attached in the modal (step 2 regression).
5. Local video `srcObject` is bound on both screens across the swap.
6. Microphone track stays enabled during `ready`.
7. `MediaRecorder` is never constructed while `status === 'ready'`.
8. Pill reads "Not recording" during `ready` and "Recording" once the recorder's `start` fires.
9. `ParticipantDisconnected` during `ready` shows the "left" placeholder.

## Camera toggles stay `enabled`-only

`setLocalTrackPreferences` disables the video `MediaStreamTrack` and never calls LiveKit's
`mute()`. For a camera track (`source === Camera`, `isUserProvided === false`, which is what
`createLocalTracks` produces) livekit-client 2.20 stops the underlying browser track on `mute()`
and acquires a *replacement* on `unmute()`. The self-preview and the `MediaRecorder` both run off a
`MediaStream` captured once at publish time, so they would keep the stopped track: the opponent's
feed would recover while the recording carried on against an ended track, and the debate — the
artifact the whole feature exists to produce — would have no video.

Disabling instead sends black frames over one track that stays live for the entire recording. The
cost is that the other side cannot tell a disabled camera from a dark room, which is why there is
no camera-off state in the UI to get wrong.

## What shipped beyond the plan

- Permission state is reported _inside_ the local tile rather than replacing the screen. The old
  layout hid the opponent and their readiness from whoever was slowest to grant, and everything
  jumped position the moment they did.
- A reconnect affordance on the intro screen for a room-connection error, since a failed intro
  connect no longer auto-retries.
- `remotePresence` is seeded from `room.remoteParticipants` after connecting: LiveKit fires
  `ParticipantConnected` only for arrivals, so whoever joins second would otherwise show the other
  person as absent while looking straight at them.

## Files touched

- `apps/web/core/debates/debate-video-tile.tsx` _(new — extracted)_
- `apps/web/core/debates/debate-recording-status-pill.tsx` _(new)_
- `apps/web/core/debates/debate-pre-join-screen.tsx` _(rebuilt)_
- `apps/web/app/space/[id]/(space)/debates/[debateId]/debate-room-page-client.tsx`
- `apps/web/app/space/[id]/(space)/debates/[debateId]/debate-room-page-client.test.tsx`
- geo-chat: **none** — confirmed by building it this way, not just by reading the handlers.

## Found in review, after the first pass

Four independent reviewers went over the first commit. What they caught, all now fixed:

- **The `/joined` retry budget was not a budget.** `useMutation` returns a new object every render
  and the countdown re-renders twice a second, so a dependency on it made the callback — and the
  effect calling it — new every render, restarting the 3-attempt series on every tick. A failing
  `/joined` became ~25-40 requests, and a late one landing after `connecting_deadline_at` makes the
  client itself cancel the debate. The budget is now a ref, the mutation is reached through a ref,
  and giving up surfaces an error instead of failing silently.
- **A connection conflict during the intro was a dead end.** `ready` became a state where a
  conflict can happen for the first time, and putting it in `canTakeOverConnection` suppressed the
  full-screen "already open in another tab" fallback — while the intro screen had no takeover
  control of its own. For `livekit_duplicate_identity` there was no exit at all. The intro now
  carries "Continue here".
- **The pill could get stuck claiming "Recording"** — see the Recording section above.
- **An intro connection failing after the status advanced lost its post-join recovery**, costing
  the pair the debate rather than 750ms.
- **The device-change reconnect raced `ensurePreview`** for the camera, the same two-captures
  hazard the auto-connect gate exists to prevent; it now waits on `previewBusy`.
- **Contrast**: white on `red-01` is 3.2:1. Dark text on the red is 5.1:1, matching the dark-on-
  green Ready badge.
- **The recorder-during-intro test asserted nothing** — no `MediaRecorder` mock, so
  `startLocalRecorder` returned on its first line. Both it and the new retry test are now verified
  to fail against the bugs they cover.

## Open questions

1. No Figma for the two-tile pre-screen or the pill. Proceeding with room-matching geometry and a
   neutral/red pill; worth a design pass before it ships.
2. Should the intro carry the claim text at full size (as today) or shrink it to make room for two
   tiles? Proposing the room's smaller `1.375rem` heading, for the same "chrome changes, layout
   doesn't" reason.
