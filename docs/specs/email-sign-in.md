# Our own sign-in box (GEO-3569 part 2, GEO-3550)

Status: built on branch `email-sign-in` behind `ourSignInBox` (off by default). This doc describes the code as built.

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
| 1 | Marketing link `?modal=signin&via=marketing` (also `via=invite`, lobby and debate-room links) | `core/auth/use-sign-in-deep-link.ts` → `usePrivySignIn` | The box, centred. On this URL (`signInExpectedOnLoad`) Privy starts loading at module evaluation and the box's chunk as soon as the app mounts. |
| 2 | Debates link to a signed-in-only tab | `core/debates/use-debates-panel-deep-link.ts:59` | The box |
| 3 | Navbar Log in, debate feed phone bar | `core/wallet/wallet.tsx:31` (`useTrackedLogin` directly) | The box. With votes on the device it still opens the save-votes sheet, as today. |
| 4 | Save-votes sheet (corner card and centred) | `partials/save-votes/save-votes-sheet.tsx` | **Keeps its layout** (vote chips, its copy, corner placement). It renders the shared card (`partials/sign-in/sign-in-card.tsx`, extracted from it) and the shared code step (`AccountStep`). |
| 5 | Explore email capture (newsletter, then account) | `partials/explore/email-capture-popup.tsx` + `email-capture-account-step.tsx` | Keeps its layout; shares the code step (`AccountStep`) and its step events. |
| 6 | Code step's fallback to Privy's dialog | `email-capture-account-step.tsx:126` | Stays Privy's own dialog (a send we could not make), opened with `fallbackFor: <attempt id>` so it carries on that attempt and never reopens the box. |
| 7 | Gated controls, all via `usePrivySignIn` | vote buttons (`entity-vote-buttons`, `use-debate-votes`), follow, comments (section + inline composer), join space, bounty card + interest card, space editors popover, ranking compose, pending-actions runner, hub live rail, claims tab, people tab, debate calendar, lobby guest sign-in, lobby reminder, call remind press, shared availability, scheduled-debate notice link, email-settings link | The box, with the caller's `onComplete` / `onCancel` / `redirectTo` / analytics unchanged |
| 8 | Google redirect return | `core/auth/google-oauth.tsx` (`GoogleOAuthCompleter`) | Unchanged. Its failure toast stays. |

Not sign-in entries (they matched the search but only read state): `export-wallet`, `analytics-user-identifier`,
`use-auth-resolving`, `use-awaited-smart-account`, `notifications/*`, `wallet-stall`.

## 2. Component and state model

The box is the save-votes sheet's centred card with the votes taken out. Its layout, field, buttons,
code step, fine print, error states and copy are all the sheet's own.

```
partials/sign-in/sign-in-card.tsx    the sheet's card body (back/close row, email step, code step) and its
                                     centred dialog, extracted from save-votes-sheet.tsx; the sheet renders it
partials/sign-in/sign-in-box.tsx     SignInBoxHost + SignInBox: the card with a heading only
partials/sign-in/sign-in-box-gate.tsx loads the box's chunk (idle, first press, or at once) and mounts it
partials/sign-in/sign-in-box-copy.ts the box's three words of its own (heading, submit, close label)
core/auth/sign-in-box/sign-in-box-store.ts  the open request: attempt id, attribution, heading, prefill
core/auth/signed-in-before.ts        "this browser has signed in" marker for likely_returning
```

- **Shared logic (D1).** The code step is `AccountStep` (`email-capture-account-step.tsx`), already
  shared by the sheet and the Explore email capture. It mails the code on mount through Privy's headless
  `useLoginWithEmail` and falls back to Privy's own dialog when a send fails. The box uses it unchanged,
  so the GEO-3550 steps go into `AccountStep` once and cover all three surfaces.
- **Opening.** `useTrackedLogin` begins the attempt (`beginPrivyAuth`) and registers the press's
  continuation on it (`continueAuthAttempt`). It then reads `readStoredFeatureFlag('ourSignInBox')`:
  on, `openSignInBox({ attemptId, attribution, heading, prefillEmail })`; off, Privy's `login()`.
- **Continuation (one owner).** `finishAuthAttempt` runs each continuation registered on the attempt
  once: `signedIn` on a signed-in end, `abandoned` (the caller's `onError` and `onCancel`) on any other,
  nothing when a newer press supersedes it. It is held by the attempt, not by the control, so it runs
  after the control unmounts, on the box, on Privy's fallback dialog and with the flag off. Whatever
  ends the attempt (`AccountStep`'s headless `completePrivyAuth`, `PrivyAuthTracker` for Privy's dialog,
  the box's close) is all it takes, in whatever order Privy reports.
- **Loading the box.** `SignInBoxGate` (mounted with the flag on) downloads the box's chunk at idle
  (2 s after mount, then `requestIdleCallback`), at the first press if that is sooner, or at once on a
  page that opens sign-in by itself (`signInExpectedOnLoad`: the sign-in link or a code step to pick
  up). If the chunk fails to load, the press gets Privy's dialog on the same attempt.
- **First paint without Privy.** The card imports nothing from `@geogenesis/auth`. `auth-hooks`'
  `useLoginWithEmail` queues calls until Privy is up (`invokeInstance` → `whenReady`, 20 s). While it
  waits, the code step shows the sheet's own pending state: "Sending a 6-digit code to", boxes disabled.
  Privy starts loading at the code step's first headless call (`invokeInstance` → `requestRealAuth()`),
  unless something loaded it earlier: a stored session, the 8 s idle load, or module evaluation on a
  `signInExpectedOnLoad` page. Mounting the box does not request it.
- **Box closing.** The box closes when its attempt ends, however it ended. Wallet: `EmbeddedWalletSync`
  (#2949); Privy's docs confirm `createOnLogin` skips headless logins.
- **Dismissal.** Close, Escape or a press on the backdrop end the box's attempt (`cancelPrivyAuthAttempt`,
  a no-op once a newer press owns sign-in), which withdraws the press. The exception is while a Google
  redirect is starting, as in the sheet.
- **Privy's dialog as the fallback.** `AccountStep` opens it on a failed send with
  `fallbackFor: <its attempt id>`. It opens only while that attempt is current and open, and then
  without preparing onboarding again. The box closes as the dialog opens; `PrivyAuthTracker` ends the
  attempt when the dialog completes or is dismissed.
- **Google.** `useContinueWithGoogle()` as in the sheet, when `googleSignIn` is on and this isn't an
  in-app browser. It carries on the box's attempt rather than starting one, so a failed start leaves the
  box open on email and the press still hears the outcome.
  - What the redirect loses: the press's in-memory continuation (its queued pending action, `onComplete`,
    `onCancel`). That is the same as Privy's modal with Google today.
  - What survives: the return address (`postOnboardingRedirectAtom`), the attempt and its tags, and
    locally saved votes.
  - Persisting continuations across the redirect is GEO-3583.
- **Other methods.** `privyConfig.loginMethods` is `['email']`. Google is added per call behind its flag,
  and no wallet login is enabled. So the box offers what Privy's dialog offers.
- **Signed in elsewhere** (another tab, a late session restore): when `authenticated` flips with the
  attempt still open a task later, the box ends it as `closed` (withdrawing the press) and closes.
- **Privy fails to load.** `sendCode` rejects after 20 s. Privy's dialog would need the same Privy, so
  instead the box, the sheet and the email capture go back to the address with "Couldn't reach sign-in.
  Try again." (`SIGN_IN_UNAVAILABLE_COPY`).

## 3. Privy capabilities relied on (`@privy-io/react-auth` 3.32.2, installed)

Quoted from `dist/dts/index.d.ts` and `types-*.d.ts`:

- `useLoginWithEmail(callbacks?)` → `sendCode({ email, disableSignup? }): Promise<void>`,
  `loginWithCode({ code }): Promise<void>`, `state: OtpFlowState`
  (`initial | sending-code | awaiting-code-input | submitting-code | done | error{error}`).
  "For a single OTP, you may call this method up to a maximum of 5 times … After 5 attempts … the
  existing OTP is no longer valid, and you must request a new one."
- `useLoginWithOAuth(callbacks?)` → `initOAuth({ provider, disableSignup? })`, which redirects. The return is
  completed by the one `useLoginWithOAuth` in `GoogleOAuthCompleter`.
- Errors are `PrivyError` with `privyErrorCode`. Privy's own code screen maps `invalid_credentials` to
  "Invalid or expired verification code": a wrong code and an expired one are the same error. The UI
  keeps the sheet's single "That code didn't work. Send a new code". Analytics tells expired apart by
  code age (`CODE_LIFETIME_MS`, assumed 10 min) and counts the five tries.
- Captcha: headless `sendCode` fetches the token itself. The sheet has used it in production since GEO-3214.
- Global `useLogin` `onError` is broadcast for headless send failures. `usePrivySignIn` acts only
  on `exited_auth_flow`, so that's harmless.

## 4. Copy

The sheet's copy throughout (`save-votes-copy.ts`, `AccountStep`'s save-votes appearance). Only what
was about votes changes:

| Where | Sheet | Box |
|---|---|---|
| Heading | Save your N votes / Join the discussion | **Log in or sign up**, or the caller's heading |
| Subtext, vote chips | votes subtext and chips | none |
| Submit | Save votes / Log in | **Continue** (pick to confirm) |
| Close button label (screen readers) | Not now | **Close** |
| Everything else | the sheet's: placeholder, "Send code" after Change, Google button and its error, fine print `SAVE_VOTES_FINE_PRINT`, "Check your email", the code step's lines and its error | the same |


## 5. Mockup

```
 ┌─────────────────────────────────┐        ┌─────────────────────────────────┐
 │                              ✕  │        │ ←                            ✕  │
 │       Log in or sign up         │        │              (✉)                │
 │ ┌─────────────────────────────┐ │        │        Check your email         │
 │ │ ✉  your@email.com           │ │        │ Enter the 6-digit code we sent  │
 │ └─────────────────────────────┘ │        │   ann@example.com  Change       │
 │ ┌─────────────────────────────┐ │        │  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐       │
 │ │          Continue           │ │        │  │ 4││ 1││ 7││  ││  ││  │       │
 │ └─────────────────────────────┘ │        │  └──┘└──┘└──┘└──┘└──┘└──┘       │
 │ ┌─────────────────────────────┐ │        │  Didn’t get it? Send a new code │
 │ │  G  Continue with Google    │ │        └─────────────────────────────────┘
 │ └─────────────────────────────┘ │
 │ We’ll email you a 6-digit code. │        the save-votes sheet's centred card, exactly;
 │ No password.                    │        Google only with its flag
 └─────────────────────────────────┘
```

## 6. Code-step recovery: no fold (decided after #3052 merged)

`core/auth/code-step.ts` (#3052) stays the code-step store, with its rules unchanged. The box plugs into it:

- Every surface's code step is `AccountStep`, which calls `announceCodeEmail`. `CodeStepTracker` reads
  Privy's shared `useLoginWithEmail` state, so codes sent from the box are recorded, claimed and
  recovered exactly as #3052 does for the sheet and the email capture.
- Recovery reaches the box through `usePrivySignIn`'s `takeCodeRecovery`. Its `prefillEmail` goes to the
  box, which opens on the email step prefilled. #3052's notice (`recoveryNoticeText`) shows as it does
  over Privy's dialog, and the box counts as that dialog for when the notice hides.
- Every step event goes through `code-step.ts`'s `capture` and its single `SEND_AUTH_STEP` switch.

Why not move the record into `AuthAttempt`:
- The planned owner-held Web Lock would break #3052's main case. A suspended iPhone tab (the visitor is
  in Mail) can't answer #3052's ping, so it reads as gone and the mail-link re-tap recovers. A frozen
  tab most likely still holds its Web Locks, so an `ifAvailable` claim would read it as alive. #3052
  uses its lock only to serialize claims.
- Moving the record would rewrite a freshly reviewed module (tab ids, duplicate/opener/frame checks,
  gone keys, ping, locked claim) to change where one record lives. Attempts are per id while the
  pending code is one per browser. Nobody would see a difference.

## 7. Events (GEO-3550) and the analytics delta

All events go through `captureAuthEvent` (growth-v2), with `attemptProperties` (entry attribution,
`auth_attempt_id`, `action_anonymous_id` for the per-person rollup). Every `auth_step` goes through
`code-step.ts`'s capture (`captureAuthStep` for the new steps). It goes out only when `SEND_AUTH_STEP`
is true, and is otherwise logged with `devLog`. #3052's switch now lives in `core/auth/auth-step-switch.ts`
so `auth-attempt.ts` can read it without an import cycle; it is still the one switch.

- The code-step events are emitted from `AccountStep`, so the box, the sheet and the email capture
  report the same steps. Each host passes its `surface`.
- "Left the page" is listened to by `SignInCard` (box and sheet), so it covers the email step too. It
  fires only while the card's own attempt is current and open.
- Google's steps are emitted from `useGoogleOAuthSignIn` (start, rejected start) and
  `GoogleOAuthCompleter` (failed return).
- Surface, method, last error and likely returning are tags on the attempt record (`tagAuthAttempt`),
  so they survive the Google redirect. The attempt events carry them (and `last_auth_error` on
  `closed`) only once `SEND_AUTH_STEP` is on; until then the live attempt events are unchanged.
- The `geo:signed-in-before:v1` marker is written only with analytics enabled.

| Funnel step | Event |
|---|---|
| Opened | `auth_prompt_viewed` (existing), fired by the box on first paint |
| Email entered | `auth_step: email_entered`, on Submit with a likely address. Never the address itself. |
| Code sent / screen shown | `auth_step: code_screen_shown`, on `sendCode` resolving (+ `privy_wait_ms`) |
| Send failed | `auth_step: code_send_failed` + `auth_error` **(new value)** |
| Code entered | `auth_step: code_submitted`, `code_age_ms` = time from sent to entered **(new value)** |
| Code rejected | `auth_step: code_rejected` + `code_rejections`, `auth_error` |
| Code expired | `auth_step: code_expired` + `auth_error`. Inferred: a rejection once the code is `CODE_LIFETIME_MS` (10 min) old, since Privy returns `invalid_credentials` for wrong and expired codes alike |
| Too many tries | `auth_step: code_rejected` with `attempts_exhausted: true` |
| Resent | `auth_step: code_resent` + `code_resends` **(new value)** |
| Tab hidden at code step / back | `left_code_screen` / `returned_to_code_screen` (existing) |
| Left the page with the box open | `auth_step: left_page` + `box_phase` (email/code), on `pagehide` **(new value)**. Distinct from `closed`. Not a finish: a back/forward-cache return continues the attempt and sends `returned_to_code_screen`. |
| Finished | `auth_step: finished` + `outcome`, and `auth_attempt_completed` (existing). `closed` carries `last_auth_error` (null if none); error = closed with an error. |
| Google started | `auth_step: google_started`, when the redirect begins (`useContinueWithGoogle`, so the sheet and the email capture send it too) |
| Google failed | `auth_step: google_failed` + `auth_error`: the start rejected (`useContinueWithGoogle` status `failed`), or the return came back failed (`GoogleOAuthCompleter`, on the return page, where the box is not mounted) |
| Recovery | `recovery_offered`, `returned_to_code_screen` (`returned_to: new_page`) (existing) |

New attempt properties: `sign_in_surface` (`box` / `save_votes` / `email_capture` / `privy_modal`),
`likely_returning` (boolean, see below), `privy_wait_ms`, `auth_error`, `code_rejections`, `code_resends`,
`attempts_exhausted`, `box_phase`, `last_auth_error`.

**Likely returning.** There's no marker today. Add `geo:signed-in-before:v1` in localStorage, set by
`completePrivyAuth` (sign-in and session restore). `likely_returning` = marker present at
`beginAuthAttempt`. It starts empty at rollout: browsers that haven't signed in since count as new until
they do. The query should start its comparison two weeks after the marker ships.

Payload rules (registry branch `signin-box-events`):
- `sign_in_method` (`email` | `google`) on every `auth_step` and on the attempt events (analytics #148).
- `sign_in_surface` is one of `box`, `save_votes`, `email_capture`, `privy_modal`.
- `auth_error` and `last_auth_error` are Privy error codes (`privyErrorCode`, e.g. `invalid_credentials`)
  or a fixed fallback, never an error message, which can contain the address. Tested, alongside the
  no-`@` test over every payload.
- `code_age_ms` is omitted when there is no code; when present it is an integer >= 0.
- `privy_wait_ms`, `code_rejections` and `code_resends` are rounded integers (the registry doesn't check them).

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
5. **Flush on leaving (checked, `analytics/src/geo-analytics.js`).** Once loaded, the runtime flushes its
   queue with `sendBeacon` on `pagehide` and on `visibilitychange` → hidden (lines 1987-1996). Every
   queued event is also persisted to an outbox and replayed on the next `pageshow`. Two caveats, both
   handled on the web side:
   - Our `left_page` listener runs in the capture phase, so it queues before the runtime's own
     `pagehide` flush (a later-registered bubble listener would miss it and wait for the next visit's
     replay).
   - The runtime loads only at idle, at first interaction, or after about 5 s (`deferUntilIdle` in
     `core/analytics.ts`). A visitor who lands on the marketing link and leaves before any of those
     loses every event of that visit, including `auth_prompt_viewed`. Proposed: when the box opens,
     start the runtime at once (a small exported trigger in `core/analytics.ts`).

## 8. Rollout

- Flag `ourSignInBox` in `featureFlagDefinitions`, `enabledByDefault: false`. Flags are per-browser
  localStorage with no remote or per-environment default, so "Bryan flips it" means a one-line change to
  `enabledByDefault` (or a per-environment default, Q2). Testers turn it on in the flags dialog.
- Flag off: Privy's dialog exactly as today. Flag on: the box everywhere, with Privy's dialog as the
  fallback for captcha or unknown send failures.
- `sign_in_surface` lets the funnel compare the box against Privy's dialog during the rollout.
- Flipping the default. The flags dialog used to store every flag's value on any toggle, which froze each
  default in that browser. `ourSignInBox` was never in any such object (it is new here), and
  `setFeatureFlagValue` now stores only flags set away from their default, rewriting an older complete
  object on its next toggle. So flipping `enabledByDefault` reaches every browser except those that set
  `ourSignInBox` off explicitly. Other flags' frozen defaults stay frozen until that browser toggles
  something; that is safe because only internal browsers use the dialog.
- The marketing link's conversion (41% now, 57% before) is the success measure: two weeks on the box.

## 9. Overlap with open PRs

- **#3052 `signin-recovery`** (unmerged): `use-tracked-login.ts`, `use-privy-sign-in.ts`, `auth-attempt.ts`,
  `email-capture-account-step.tsx`, `feature-flags.ts`, `auth-root.tsx`, `app/layout.tsx`, `app/entry.tsx`,
  `core/analytics.ts`, `core/providers.tsx`, `styles/styles.css`, code-step files. Mounting the box
  (`entry.tsx`) and starting the analytics runtime (`analytics.ts`) also wait for the merge.
  The box touches `use-tracked-login.ts`, `auth-attempt.ts`, `email-capture-account-step.tsx` and
  `feature-flags.ts` too. Build order: the box's own new files first. Edits to the shared files wait for
  #3052 to merge and for a master merge.
- **#2699** (debate player redesign) edits `email-capture-account-step.tsx`, where the step events go.
  That's a merge conflict, not a design one.
- **#2700, #2175** edit `feature-flags.ts` and the flags dialog test: one-line conflicts.
- **#3049** edits `modal-deep-link.ts` (adds `?modal=comments`). No conflict with the sign-in link.
- **#2884** edits `analytics-events.ts`. The box adds no new event names there (`auth_step` comes from #3052).
- **#2680** (GEO-3107 wallet session cookie, open): server cookie and API routes, `use-smart-account.ts`.
  No file overlap. The box completes sign-in through the same Privy session that #2680's cookie sync
  reads, so nothing changes for it.

## 10. Decisions

- D1: shared logic and the shared card. The sheet and the email capture keep their layouts. The code step
  is `AccountStep` for all three.
- Look: the sheet's UX exactly. Only the heading ("Log in or sign up", or the caller's), the submit label
  and the close label differ, and there are no votes or newsletter parts.
- Fine print: `SAVE_VOTES_FINE_PRINT`.
- Flag: `enabledByDefault: false` everywhere. Testing uses the flags dialog.
- Code lifetime: `CODE_LIFETIME_MS` = 10 min, to be confirmed by Bryan's test.
- Terms consent: off. Privy has no terms link set, so the box has no consent line and keeps `SAVE_VOTES_FINE_PRINT`.
- Google redirect (Bryan, 2026-11-04): Google stays beside email on every surface behind `googleSignIn`. A
  queued action is dropped on a Google redirect, as with Privy's modal. Persisting continuations is GEO-3583.
- Privy fallback: when the code step falls back to Privy's dialog, it carries on the box's open attempt
  (`fallbackFor`), so the press's continuation and withdrawal still run once.
- Continuations belong to the attempt (`continueAuthAttempt`), run once by `finishAuthAttempt`.

Open:
- The submit label "Continue" (the sheet's own are votes-specific: "Save votes" / "Log in").
