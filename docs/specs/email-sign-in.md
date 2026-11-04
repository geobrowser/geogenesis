# Our own sign-in box (GEO-3569 part 2, GEO-3550)

Status: design, for review before any feature code. Base `upstream/master` 99b732757.

## Why

The marketing sign-in link converts about 41% against 57% before 15 Oct. Most of the wait is Privy
starting up (about 7 s on a slow phone) before its window appears. Decision: one sign-in box of our own,
used for every sign-in in the app. It paints without waiting for Privy, Privy loads behind it, and Submit
sends the code through Privy's headless email API, as the save-votes sheet already does. Google, and any
other sign-in option, stays next to the email field (Preston's condition). Because the steps become ours,
the box carries the GEO-3550 step funnel.

## 1. Entry points and what each becomes

Every Privy `login()` in the app goes through one function, `useTrackedLogin`
(`core/hooks/use-tracked-login.ts:59`). `usePrivySignIn` wraps it, and the navbar calls it directly.
Switching that one call to "open our box" moves every entry below at once.

| # | Entry | Code | Becomes |
|---|---|---|---|
| 1 | Marketing link `?modal=signin&via=marketing` (also `via=invite`, lobby and debate-room links) | `core/auth/use-sign-in-deep-link.ts` → `usePrivySignIn` | The box, centred. Its chunk and Privy both start loading at module evaluation on this URL (#3052's `signInExpectedOnLoad` already loads Privy early). |
| 2 | Debates link to a signed-in-only tab | `core/debates/use-debates-panel-deep-link.ts:59` | The box |
| 3 | Navbar Log in, debate feed phone bar | `core/wallet/wallet.tsx:31` (`useTrackedLogin` directly) | The box. With votes on the device it still opens the save-votes sheet, as today. |
| 4 | Save-votes sheet (corner card and centred) | `partials/save-votes/save-votes-sheet.tsx` | **Keeps its layout** (vote chips, its copy, corner placement), **shares the logic**: same controller hook, same code step, same errors and events. See decision D1. |
| 5 | Explore email capture (newsletter, then account) | `partials/explore/email-capture-popup.tsx` + `email-capture-account-step.tsx` | Same as 4: keeps its layout, shares the logic. |
| 6 | Code step's fallback to Privy's dialog | `email-capture-account-step.tsx:126` | Stays Privy's own dialog (a send we could not make). Needs a `surface: 'privy'` option on `useTrackedLogin` so it never reopens our box in a loop. |
| 7 | Gated controls, all via `usePrivySignIn` | vote buttons (`entity-vote-buttons`, `use-debate-votes`), follow, comments (section + inline composer), join space, bounty card + interest card, space editors popover, ranking compose, pending-actions runner, hub live rail, claims tab, people tab, debate calendar, lobby guest sign-in, lobby reminder, call remind press, shared availability, scheduled-debate notice link, email-settings link | The box, with the caller's `onComplete` / `onCancel` / `redirectTo` / analytics unchanged |
| 8 | Google redirect return | `core/auth/google-oauth.tsx` (`GoogleOAuthCompleter`) | Unchanged. Its failure toast stays. |

Not sign-in entries (they matched the search but only read state): `export-wallet`, `analytics-user-identifier`,
`use-auth-resolving`, `use-awaited-smart-account`, `notifications/*`, `wallet-stall`.

## 2. Component and state model

```
core/auth/sign-in-box/
  sign-in-box-store.ts     module store: the open request (attribution, callbacks, heading), subscribe/open/close
  use-email-sign-in.ts     controller: phases, Privy headless calls, error mapping, events; used by the box,
                           the save-votes sheet and the email capture
  sign-in-errors.ts        pure: Privy error + code age + rejection count → { kind, copy } (unit tested)
  sign-in-box.tsx          the centred card / phone bottom sheet (Radix Dialog), mounted once
  code-entry.tsx           the six-box code field, lifted out of email-capture-account-step.tsx
```

- **Opening.** `useTrackedLogin` reads `readStoredFeatureFlag('ourSignInBox')` at the press. Flag on:
  `beginPrivyAuth(...)` as today, then `openSignInBox({ attempt, context, onComplete, onError, heading })`
  instead of Privy's `login()`. Flag off: unchanged.
- **First paint without Privy.** The box imports nothing from `@geogenesis/auth`. It uses `auth-hooks.ts`,
  whose `useLoginWithEmail` and `useLoginWithOAuth` already return stand-ins until Privy is up and queue
  calls until it is (`invokeInstance` → `whenReady`, 20 s timeout). The box is a small `dynamic()` chunk,
  prefetched on idle and imported at module evaluation on `?modal=signin`. Radix Dialog and the save-votes
  styles are already in the app. The box calls `requestRealAuth()` (`auth-store.ts:116`) when it mounts.
- **Submit before Privy is ready.** The button turns into "Sending code…" right away. `sendCode` waits for
  Privy inside `invokeInstance`. After 6 s it adds "Still connecting…". If Privy doesn't load
  (`whenReady` rejects, or `markHostFailed`), it shows an error with Try again, which calls `restartAuthHost()`.
- **Existing session.** Signed-in readers never see the box: `useTrackedLogin` already returns early when
  `authenticated`. Deep links wait for `ready`. A signed-out shim reports `ready: true` immediately, and a
  detected session reports not-ready until Privy restores it, so a returning signed-in reader is never
  asked to sign in.
- **Completion.** Headless `loginWithCode` calls only its own hook's `onComplete`. Privy's global
  `useLogin` listeners are not called (checked in 3.32.2 source; `AccountStep` already relies on this).
  So the controller does what `useTrackedLogin`'s `useGeoLogin` callback does today:
  `completePrivyAuth(args, attribution)`, then the request's `onComplete` inside `withActionContext`.
  Wallet: `EmbeddedWalletSync` (#2949) creates the embedded wallet for any session. Privy's docs confirm
  `createOnLogin` does not apply to headless login. Onboarding and `redirectTo` are unchanged,
  because `usePrepareOnboarding` runs at the press as today.
- **Dismissal.** Close, Escape or a press on the backdrop: `cancelPrivyAuth()` (outcome `closed`, runs
  `onSignInAbandoned` withdrawals), then the request's `onError('exited_auth_flow')`, so every caller's
  "abandoned" path keeps working.
- **Google.** `useContinueWithGoogle()` as in the sheet. Shown when the `googleSignIn` flag is on and this
  isn't an in-app browser. A Google sign-in redirects, so in-memory pending actions are dropped, as today.
- **Other methods.** `privyConfig.loginMethods` is `['email']` (`core/wallet/privy.tsx`). Google is
  added per call behind `googleSignIn`. `walletList: ['detected_ethereum_wallets']` affects only Privy's
  wallet picker, which no sign-in opens. **No wallet login is enabled today**, so the box offers email and
  (flagged) Google, matching Privy's dialog exactly. Privy's dashboard can't add a method the client
  config doesn't list, so nothing is hidden. If a method is added later, it gets a button here.
- **Hiding behind other overlays.** The save-votes sheet hides itself while Privy's `isModalOpen`. It also
  needs to hide while the box is open (`signInBoxOpen()` from the store).

## 3. Privy capabilities relied on (`@privy-io/react-auth` 3.32.2, installed)

Quoted from `dist/dts/index.d.ts` and `types-*.d.ts`:

- `useLoginWithEmail(callbacks?)` → `sendCode({ email, disableSignup? }): Promise<void>`,
  `loginWithCode({ code }): Promise<void>`, `state: OtpFlowState`
  (`initial | sending-code | awaiting-code-input | submitting-code | done | error{error}`).
  "For a single OTP, you may call this method up to a maximum of 5 times … After 5 attempts … the
  existing OTP is no longer valid, and you must request a new one."
- `useLoginWithOAuth(callbacks?)` → `initOAuth({ provider, disableSignup? })`, which redirects. The return is
  completed by the one `useLoginWithOAuth` mounted in `GoogleOAuthCompleter`.
- Errors are `PrivyError` with `privyErrorCode`. Privy's own code screen
  (`AwaitingPasswordlessCodeScreen`) maps `invalid_credentials` to "Invalid or expired verification
  code". **Privy does not tell a wrong code from an expired one.** We tell them apart by code age (below).
  Other codes it handles: `max_accounts_reached`, `user_does_not_exist` (only with `disableSignup`),
  `linked_to_another_user`, `account_transfer_required`. On send: `too_many_requests`,
  `invalid_data`, `disallowed_plus_email`, `allowlist_rejected`, `captcha_failure` / `captcha_timeout` /
  `invalid_captcha`, `client_request_timeout`.
- Captcha: headless `sendCode` fetches the captcha token itself (`qr(e)` in the bundle). The save-votes
  path has used it in production since GEO-3214.
- Global `useLogin` `onError` *is* broadcast for headless send failures (`initLoginWithEmail` →
  `bt(Pe,"login","onError",…)`). `usePrivySignIn` only acts on `exited_auth_flow`, so that's harmless.
- Code lifetime: Privy doesn't publish it in the installed types or the docs I checked. #3052 assumes 10
  minutes. **To confirm with one real sign-up** (open question Q4).

### Error → copy

| Situation | Detected by | Copy |
|---|---|---|
| Wrong code | `invalid_credentials`, code younger than `CODE_LIFETIME_MS`, fewer than 5 rejections | That code didn't work. Check it and try again. |
| Expired code | `invalid_credentials`, code at least `CODE_LIFETIME_MS` old | That code has expired. **Send a new code** |
| Too many tries | 5th `invalid_credentials` on one code (counted by us), or `too_many_requests` on submit | Too many tries for this code. **Send a new code** (boxes disabled) |
| Too many codes requested | `too_many_requests` on send | Too many codes sent. Wait a minute, then try again. |
| Bad address | `invalid_data`, `disallowed_plus_email` | Check your email address and try again. |
| Not allowed | `allowlist_rejected`, `max_accounts_reached` | We can't sign you in with this email right now. |
| Captcha or unknown send failure | captcha codes, `unknown_auth_error` | Opens Privy's own dialog, keeping the attempt (today's fallback) |
| Privy didn't load / timed out | `whenReady` rejects, `client_request_timeout` | Couldn't reach sign-in. Check your connection. **Try again** |
| Google didn't start | `useContinueWithGoogle` status `failed` | Google sign-in didn't start. Try again, or use your email. |

## 4. Copy for every state

| State | Copy |
|---|---|
| Heading (default) | Log in or sign up |
| Heading (lobby/room link) | Join the discussion |
| Email field placeholder | your@email.com |
| Submit | Continue |
| Submit pending | Sending code… |
| Slow Privy (6 s) | Still connecting… |
| Google | Continue with Google |
| Fine print | Same as the save-votes sheet (`SAVE_VOTES_FINE_PRINT`), or none |
| Code heading | Check your email |
| Code subtext | Enter the 6-digit code we sent to / **address** · Change |
| Verifying | Verifying… |
| Resend | Didn't get it? **Send a new code** |
| After resend | New code sent. |
| Recovered (reload/new tab) | Your code only works in the tab that asked for it. **Send a new code** to **address** |
| Done | (box closes; onboarding or the action continues) |

## 5. Mockup

```
 ┌─────────────────────────────────┐        ┌─────────────────────────────────┐
 │                              ✕  │        │ ←                            ✕  │
 │       Log in or sign up         │        │              (✉)                │
 │                                 │        │        Check your email         │
 │ ┌─────────────────────────────┐ │        │ Enter the 6-digit code we sent  │
 │ │ ✉  your@email.com           │ │        │   ann@example.com · Change      │
 │ └─────────────────────────────┘ │        │                                 │
 │ ┌─────────────────────────────┐ │        │  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐       │
 │ │          Continue           │ │        │  │ 4││ 1││ 7││  ││  ││  │       │
 │ └─────────────────────────────┘ │        │  └──┘└──┘└──┘└──┘└──┘└──┘       │
 │ ┌─────────────────────────────┐ │        │                                 │
 │ │  G  Continue with Google    │ │        │  Didn't get it? Send a new code │
 │ └─────────────────────────────┘ │        │                                 │
 │   fine print                    │        └─────────────────────────────────┘
 └─────────────────────────────────┘
   centred 360px card on desktop, bottom sheet on phones (save-votes CENTERED_CARD_CLASS,
   fieldClass, primaryButtonClass, googleButtonClass, codeStepClasses); Google only with its flag
```

## 6. Folding the code step into AuthAttempt (after #3052 merges)

#3052 keeps a second store (`geo:auth-code-step:v1`). It records the code's sender, owner, claimant and
attribution, and runs a BroadcastChannel ping to see if the owner is alive. The fold:

- `AuthAttempt` gains `code?: { sentAt; firstSentAt; resends; rejections; documentId; leftAt?; claimedBy?;
  recoveryOf? }` and `email?: string` (local only). `attemptProperties()` never reads `code` or `email`.
  A test asserts no captured payload contains `@`. The attempt is already persisted per id (24 h TTL),
  and the recovery window is `code.sentAt` + 10 min.
- **Same-tab or link only.** A reload in the same tab finds the attempt through the sessionStorage pointer
  (`POINTER`), which survives a reload. A new tab may recover only if it landed on a sign-in link
  (`?modal=signin`, or the debates link) within the window. Any other new tab is left alone.
- **One claimant: Web Locks.** The document that sent the code holds
  `navigator.locks.request('geo:auth-code:'+attemptId)` for its lifetime. A page that wants to recover
  asks with `{ ifAvailable: true }`. Granted means the owner is gone, and this page becomes the owner by
  keeping the lock. Not granted means the owner is alive, so do nothing. This replaces the ping and the
  `pagehide` / `ownerGoneAt` bookkeeping. Without Web Locks, same-tab only.
- **Cleared** in `finishAuthAttempt` (signed in, closed, superseded), in `resetPrivyAuthSession`
  (sign-out), and when the box closes.
- **Recovery in the box** opens straight on "Your code only works in the tab that asked for it. Send a new
  code to address". No prefill of Privy's field and no notice over Privy's dialog.
- **Privy's dialog (flag off)** keeps #3052's tracker, but writes into `AuthAttempt.code` through the same
  functions, so there is one store with two writers. When the flag is removed, the tracker goes.
- `code-step.ts` shrinks to the functions above, over AuthAttempt. `code-step-recovery.tsx`'s overlay is
  replaced by the box's recovered state.

## 7. Events (GEO-3550) and the analytics delta

All events go through `captureAuthEvent` (growth-v2), with `attemptProperties` (entry attribution,
`auth_attempt_id`, `action_anonymous_id` for the per-person rollup). `auth_step` goes out only when
`SEND_AUTH_STEP` is true, reusing #3052's switch, and is otherwise logged with `devLog`.

| Funnel step | Event |
|---|---|
| Opened | `auth_prompt_viewed` (existing), fired by the box on first paint |
| Email entered | `auth_step: email_entered`, on Submit with a likely address. Never the address itself. |
| Code sent / screen shown | `auth_step: code_screen_shown`, on `sendCode` resolving (+ `privy_wait_ms`) |
| Send failed | `auth_step: code_send_failed` + `auth_error` **(new value)** |
| Code entered | `auth_step: code_submitted`, `code_age_ms` = time from sent to entered **(new value)** |
| Code rejected | `auth_step: code_rejected` + `code_rejections`, `auth_error` |
| Code expired | `auth_step: code_expired` |
| Too many tries | `auth_step: code_rejected` with `attempts_exhausted: true` |
| Resent | `auth_step: code_resent` + `code_resends` **(new value)** |
| Tab hidden at code step / back | `left_code_screen` / `returned_to_code_screen` (existing) |
| Left the page with the box open | `auth_step: left_page` + `box_phase` (email/code), on `pagehide` **(new value)**. Distinct from `closed`. Not a finish: a back/forward-cache return continues the attempt and sends `returned_to_code_screen`. |
| Finished | `auth_step: finished` + `outcome`, and `auth_attempt_completed` (existing). `closed` carries `last_auth_error` (null if none); error = closed with an error. |
| Recovery | `recovery_offered`, `returned_to_code_screen` (`returned_to: new_page`) (existing) |

New attempt properties: `sign_in_surface` (`box` / `save_votes` / `email_capture` / `privy_modal`),
`likely_returning` (boolean, see below), `privy_wait_ms`, `auth_error`, `code_rejections`, `code_resends`,
`attempts_exhausted`, `box_phase`, `last_auth_error`.

**Likely returning.** There's no marker today. Add `geo:signed-in-before:v1` in localStorage, set by
`completePrivyAuth` (sign-in and session restore). `likely_returning` = marker present at
`beginAuthAttempt`. It starts empty at rollout: browsers that haven't signed in since count as new until
they do. The query should start its comparison two weeks after the marker ships.

### Analytics delta to request (beyond analytics#144)

1. `enum_auth_step`: add `code_send_failed`, `code_submitted`, `code_resent`, `left_page`.
2. `code_age_ms`: optional (or nullable) on `auth_step`. `email_entered`, `code_send_failed` and an
   email-phase `left_page` have no code yet. As registered (required, non-negative integer), these would
   be rejected or need a fake 0.
3. `auth_attempt_completed`: confirm `outcome` takes any string (no enum today). `last_auth_error` is a
   new optional string.
4. Optional properties listed above. The collector accepts unregistered optional properties today (the
   contract test sends extras), so this is documentation only, plus `likely_returning` and
   `sign_in_surface` as split columns in `signin-steps.sql`.
5. `left_page` is sent from `pagehide`. Confirm the collector client flushes on `pagehide` (beacon).
   Otherwise left events are lost, which is the "missing data" GEO-3550 is about.

## 8. Rollout

- Flag `ourSignInBox` in `featureFlagDefinitions`, `enabledByDefault: false`. Flags are per-browser
  localStorage with no remote or per-environment default, so "Bryan flips it" means a one-line change to
  `enabledByDefault` (or a per-environment default, Q2). Testers turn it on in the flags dialog.
- Flag off: Privy's dialog exactly as today. Flag on: the box everywhere, with Privy's dialog as the
  fallback for captcha or unknown send failures.
- `sign_in_surface` lets the funnel compare the box against Privy's dialog during the rollout.
- The marketing link's conversion (41% now, 57% before) is the success measure: two weeks on the box.

## 9. Overlap with open PRs

- **#3052 `signin-recovery`** (unmerged): `use-tracked-login.ts`, `use-privy-sign-in.ts`, `auth-attempt.ts`,
  `email-capture-account-step.tsx`, `feature-flags.ts`, `auth-root.tsx`, `app/layout.tsx`, code-step files.
  The box touches `use-tracked-login.ts`, `auth-attempt.ts`, `email-capture-account-step.tsx` and
  `feature-flags.ts` too. Build order: the box's own new files first. Edits to the shared files wait for
  #3052 to merge and for a master merge.
- **#2699** (debate player redesign) edits `email-capture-account-step.tsx`, which I'd lift `code-entry`
  from. That's a merge conflict, not a design one.
- **#2700, #2175** edit `feature-flags.ts` and the flags dialog test: one-line conflicts.
- **#3049** edits `modal-deep-link.ts` (adds `?modal=comments`). No conflict with the sign-in link.
- **#2884** edits `analytics-events.ts`. The box adds no new event names there (`auth_step` comes from #3052).
- **#2680** (GEO-3107 wallet session cookie, open): server cookie and API routes, `use-smart-account.ts`.
  No file overlap. The box completes sign-in through the same Privy session that #2680's cookie sync
  reads, so nothing changes for it.

## 10. Decisions and open questions

- **D1 (need your call).** Save-votes sheet and Explore email capture: keep their layouts and share the
  controller and code entry (recommended: the chips and newsletter step are their point, and the sheet
  already has the look the box borrows), or render the shared box inside them.
- **Q1.** Fine print in the box: reuse the save-votes line, or none?
- **Q2.** Should the flag default differ by environment (local/preview on, production off)? There's no
  mechanism for that today.
- **Q3.** Is "Log in or sign up" the heading, or a heading per entry (callers already pass one for the lobby)?
- **Q4.** Code lifetime for telling expired from wrong: confirm with one real sign-up (needs your go-ahead
  and a fresh address), or take Privy support's figure.
- **Q5.** Terms consent: Privy's dialog shows a consent screen if the dashboard requires terms
  (`requireUsersAcceptTerms`). The headless path skips it, as the save-votes path does today. Is it
  off in the dashboard?
