---
title: Keep Match Acceptance Local to One Tab - Plan
type: fix
date: 2026-07-31
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Keep Match Acceptance Local to One Tab

## Goal Capsule

Keep match discovery global so every signed-in tab can show the incoming match, but make acceptance and the resulting pre-join/debate handoff local to one tab when Web Locks are available. Secondary tabs must close the prompt and remain on their current page, while an explicit visit to the debate URL continues to use the existing debate-room ownership message and takeover flow. Unsupported browsers retain best-effort arbitration plus the existing backend and debate-room ownership safety nets.

## Product Contract

### Problem

`DebateCoordinator` is mounted globally and receives the same server activity in every tab. Today, `participant.accepted` and active debate activity are treated as instructions to start pre-join media and navigate, so accepting a match in one tab redirects every open tab. That violates the expected UX and can start duplicate media/debate flows.

### Requirements

- R1: A pending match remains visible in every tab until a user accepts or declines it.
- R2: When Web Locks are available, acceptance is arbitrated before the accept request so only one same-browser tab becomes the local flow owner. Unsupported browsers degrade to best-effort client arbitration without changing stable backend identity.
- R3: After successful acceptance, secondary tabs immediately hide the prompt and stay on their current URL through the match-to-debate transition.
- R4: Only the owning tab may start pre-join media, queue readiness, promote the media session, or navigate automatically to the debate.
- R5: The owning tab recovers after reload through tab-local persisted state; a duplicated or secondary tab must not inherit an active flow while the original owner exists.
- R6: Closing the owner does not promote or auto-route another tab. Normal server expiry/cancellation remains authoritative.
- R7: Direct navigation to a debate URL retains the existing debate-room ownership conflict and explicit takeover experience.

### Acceptance Examples

1. Two tabs receive the same match. Both show the request. Accepting in tab A opens pre-join there, closes the request in tab B, and leaves tab B's pathname unchanged after the debate appears.
2. Tabs A and B click Accept at nearly the same time. Only the Web Lock winner calls the accept mutation; the other tab remains a non-owner and dismisses when acceptance becomes canonical.
3. Tab A accepts and reloads before the debate exists. It restores the locally owned pre-join flow. Tab B, which has no valid local ownership, does not start media or navigate.
4. Tab A accepts and then closes. Tab B remains on its current page and is not automatically promoted.
5. A user explicitly opens the debate URL in tab B while tab A owns the room. Tab B sees the existing “already open in another tab” UI and may explicitly choose takeover where allowed.
6. The accept request fails before reaching the server. Refreshed activity confirms the match is still unaccepted, so the attempted owner clears its pending marker, releases arbitration, and can retry; no other tab is redirected.
7. The accept request commits but its response is lost. The pending owner retains arbitration while refreshing activity, observes canonical acceptance, upgrades to confirmed ownership, and continues; an inconclusive refresh remains an explicit retryable error instead of silently orphaning the flow.

### Scope Boundaries

In scope: same-browser match acceptance arbitration, tab-local persistence, immediate cross-tab dismissal, owner-only pre-join/media/readiness/navigation, reload recovery, and regression coverage.

Out of scope: backend token or identity changes, automatic owner election after a tab closes, cross-device arbitration before LiveKit, and changes to the explicit debate-room ownership/takeover experience.

## Settled Decisions

- Product — secondary tabs close the accepted match and remain on their current page, chosen by the user over redirecting them to the debate or an ownership screen.
- Product — only an explicit debate URL shows the existing “debate running in another tab” experience, chosen over surfacing it after an unrelated tab accepts a match.
- Product — no tab is automatically promoted if the accepting tab closes, chosen over an owner-election flow.
- Technical — same-tab reload recovery uses `sessionStorage`, chosen by the user over losing the local flow on reload. A Web Lock revalidates ownership because duplicated tabs may clone session storage.
- Technical — retain stable backend user identity and the existing API. Frontend Web Locks plus broadcast/activity reconciliation are sufficient for same-browser arbitration, while the existing debate-room coordinator remains the final direct-URL/LiveKit guard.

## Planning Contract

### Key Technical Decisions

- Add a match-specific ownership helper rather than extending the debate-room coordinator. Match ownership has no takeover or promotion semantics, while room ownership intentionally supports explicit takeover.
- Key coordination by current user and match ID. Persist a versioned owner marker with the user, match, claim, space, timestamp, and local instance ID so debate-only activity can be correlated after the match disappears.
- Acquire an exclusive Web Lock before any accept or decline mutation so conflicting same-browser actions cannot race. After acquiring for acceptance, persist a `pending` owner marker before sending the request, upgrade it to `confirmed` after a successful response or canonical activity reconciliation, and broadcast only confirmed acceptance.
- Treat transport failure as an ambiguous outcome: retain arbitration while forcing an activity refresh. Promote the pending marker if the same match or correlated debate shows this user accepted; clear and release only when refreshed activity confirms unaccepted or terminal state. A bounded inconclusive result stays retryable in the owning tab rather than creating an ownerless accepted flow.
- Use a one-hour TTL measured from `acceptedAt` for confirmed markers and from `createdAt` for pending markers. Remove expired records before lock acquisition or routing. Also clear on confirmed failed acceptance, decline, successful abort, terminal/mismatched activity, or explicit debate-route handoff.
- Treat broadcast as an immediate UI signal, not the source of truth. A tab that missed the message still becomes a non-owner when server activity reports acceptance/debate without a valid local owner marker.
- Treat Web Locks and BroadcastChannel as independent capabilities. Unsupported APIs degrade without crashing; the backend's idempotent state and existing room ownership remain the final safety net.
- Gate every local side effect on validated ownership. Server `participant.accepted` is canonical match state, but is not proof that the current tab owns the flow.
- Represent reload recovery as a non-interactive revalidation state. Until the persisted marker and Web Lock are validated, do not expose match actions, start media, submit readiness, or navigate; failure clears the marker before reconciling as a non-owner.
- Preserve current match retention, pre-join device setup, queued readiness retry, media-session promotion, rematch routing, share-prompt suppression, and explicit room ownership behavior.

### Assumptions

- The activity payload continues to expose at most one active match/debate flow per user.
- A debate can be correlated to the accepted match by claim ID, space ID, and current-user participation even when the match is no longer returned; the one-hour TTL bounds false correlation with a later debate on the same claim.
- Strict simultaneous-click exclusion is best-effort in browsers without Web Locks; no new backend owner nonce is introduced in this change.
- Queued “I’m ready” intent is not restored across reload. The owner may re-enter pre-join and confirm readiness again.

## High-Level Design

```mermaid
sequenceDiagram
    participant A as Accepting tab
    participant L as Web Lock
    participant API as Debate API/activity
    participant B as Secondary tab

    A->>L: Acquire user + match ownership
    L-->>A: Granted
    A->>API: Accept match
    API-->>A: Accepted match/debate
    A->>A: Persist tab-local owner marker
    A-->>B: Broadcast acceptance confirmed
    B->>B: Hide prompt; keep current URL
    API-->>B: Accepted/debate activity
    B->>B: No valid owner marker; no media/navigation
    API-->>A: Accepted/debate activity
    A->>A: Start/restore pre-join, ready, navigate
```

## Implementation Units

### U1 — Match tab ownership coordinator

Files:

- `apps/web/core/debates/debate-match-tab-ownership.ts`
- `apps/web/core/debates/debate-match-tab-ownership.test.ts`

Implement versioned pending/confirmed session-storage records, defensive parsing with the exact one-hour TTL and activity correlation, per-user/per-match Web Lock acquisition and release, and BroadcastChannel acceptance notifications. Persist pending ownership after acquiring the lock but before sending accept; only confirmed ownership is broadcast. The coordinator must not implement takeover or automatic reacquisition for a secondary tab. Reload recovery may perform only an `ifAvailable` lock probe when the current tab has a matching persisted marker and the Navigation Timing entry identifies an actual reload; ordinary navigation or a duplicated tab invalidates the cloned marker before acquisition, and a failed reload acquisition invalidates it as well.

Tests cover concurrent action acquisition, pending-before-request persistence, success upgrade/broadcast, definite failure release, ambiguous failure reconciliation, same-tab recovery, duplicate-tab recovery losing arbitration, owner close without promotion, exact TTL/stale/malformed records, and unsupported/throwing APIs.

### U2 — Owner-only match prompt behavior

Files:

- `apps/web/core/debates/match-prompt.tsx`
- `apps/web/core/debates/match-prompt.test.tsx`

Instantiate ownership for the current match/user, acquire it before calling accept or decline, persist pending acceptance before calling the accept mutation, confirm ownership on success or canonical reconciliation, and consume cross-tab confirmation to hide secondary UI immediately. Replace every `participant.accepted`-driven local side effect with validated local ownership: waiting/pre-screen state, media preview, debate lookup/navigation, queued readiness, and media-session promotion. While ownership is revalidating or reconciling an ambiguous response, render no conflicting match actions and trigger no unvalidated side effects. Preserve the current accepting-tab experience and cleanup ownership on confirmed decline, successful abort, and terminal/mismatched flow state. On cross-tab dismissal, rely on the existing dialog focus restoration where available, fall back to the page's main landmark, and expose a polite screen-reader-only acceptance status without routing or showing an ownership screen.

Tests prove a server-accepted non-owner neither renders pre-join nor starts media/readiness/navigation; a confirmed or recovered owner keeps current behavior; revalidation and ambiguous-failure reconciliation expose no conflicting intermediate action; cross-tab dismissal restores an accessible page context; accept/decline races call only the winning mutation; definite failures stay retryable; committed-but-lost responses recover through activity; and existing device/readiness/session-promotion cases remain green.

### U3 — Ownership-aware global routing

Files:

- `apps/web/core/debates/debate-coordinator.tsx`
- `apps/web/core/debates/debate-coordinator.test.tsx`

Remove unconditional active-debate auto-routing. Keep the retained match as a handoff guard, but render or route only for the locally owning tab once shared activity shows acceptance. When an owner reloads after the match has disappeared, correlate the persisted marker with active debate activity, revalidate the Web Lock, and route that tab. A non-owner stays on its current pathname. Preserve rematch and share-prompt routing rules. Reaching the explicit debate route hands responsibility to the existing room coordinator and clears stale match handoff state.

Tests cover initial prompt visibility, immediate secondary dismissal, no redirect through match-to-debate activity, retained owner handoff, owner-only reload recovery, secondary reload behavior, and unchanged rematch/share routing.

## Verification Contract

Run from `apps/web`:

```bash
bun vitest run core/debates/debate-match-tab-ownership.test.ts core/debates/match-prompt.test.tsx core/debates/debate-coordinator.test.tsx
bun vitest run core/debates/debate-room-ownership.test.ts 'app/space/[id]/(space)/debates/[debateId]/debate-room-page-client.test.tsx'
bun eslint core/debates/debate-match-tab-ownership.ts core/debates/debate-match-tab-ownership.test.ts core/debates/match-prompt.tsx core/debates/match-prompt.test.tsx core/debates/debate-coordinator.tsx core/debates/debate-coordinator.test.tsx
```

Browser verification:

- Open two authenticated tabs on different non-debate pages and confirm both display a new match.
- Accept in one tab and confirm only that tab requests camera/microphone and moves through pre-join; the other closes the prompt and its URL does not change.
- Reload the accepting tab before joining and confirm it recovers. Close it and confirm the secondary remains stationary.
- Explicitly open the debate URL in the secondary and confirm the existing room ownership/takeover message appears.
- Repeat with two different users to confirm the normal two-participant debate still connects.

## Definition of Done

- With Web Locks available, match acceptance and all pre-join side effects are local to one same-browser tab; unsupported-browser fallback is documented and remains protected by backend identity and debate-room ownership.
- Secondary tabs dismiss the accepted match without redirecting or starting media.
- The accepting tab recovers after reload; closing it never promotes another tab.
- Direct debate URLs retain the existing ownership message and takeover behavior.
- Focused ownership, prompt, coordinator, and room-ownership tests pass, lint is clean, and manual two-tab/two-participant verification is recorded in the PR.
