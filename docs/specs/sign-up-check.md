# Sign-in failure reporting (GEO-3571)

From 20 to 22 Oct the marketing "Sign in / Sign up" link opened nothing, and nothing told us. This
adds Sentry reports from real visitors' browsers when sign-in fails to load, to appear or to send a
code, and regression tests at the seam that broke. No synthetic accounts, nothing run against
production.

## What broke

The most likely cause, reproduced locally but not proven in production (a Privy that was blocked or
never became ready fits the data too, which is why the reports below cover all three). At bd13e6b7c (#2930) a signed-out visitor got `ready: true` from the auth shim at once
(`core/wallet/auth-hooks.ts`), so the `?modal=signin` deep link fired immediately and called the
shim's `login()`. That only then requested Privy. If Privy took more than 20 s to start,
`whenReady` (`core/wallet/auth-store.ts`) rejected, and `swallowing()` turned the rejection into
`console.error('[auth] could not load sign-in')`. No dialog, no attempt outcome, no Sentry event.

Today the box (#3062/#3072) appears without Privy and #3052 starts Privy early for the link, but the
code send still goes through `invokeInstance` → `whenReady` with the same silent 20 s cliff, and
nothing in `core/auth`, `core/wallet` or `partials/sign-in` reports to Sentry.

The tests missed it because every deep-link and sign-in test mocks `~/core/wallet/auth-hooks`, and
`auth-root.test.tsx`'s Privy stand-in is ready on mount.

## 1. Sentry reports

All through the existing helpers in `core/telemetry/logger.ts` (`reportError` for exceptions,
`reportEvent` for counted messages). Same DSN and project as the rest of the web app; nothing new
to configure. Both helpers are no-ops when telemetry is off, so tests and local runs stay quiet.

All three live in `core/auth/sign-in-reports.ts`. Each is a `reportEvent` message (a constant name,
so one Sentry issue per report), sent at most once per attempt and only while a sign-in attempt is
open: Privy loading in the background for a visitor who never asked to sign in is not reported. The
watchdogs hang off the existing attempt lifecycle (`subscribeAuthAttempts` in `core/auth-attempt.ts`),
installed by `auth-root.tsx`.

A background tab throttles timers and loading, so no timeout (`never_ready`, `call_timeout`, the
prompt and code-send timeouts) is reported for an attempt whose page was hidden at any point since it
began, including a link opened in a background tab. `chunk_load` is reported regardless.

Shared tags, low cardinality only: `sign_in_surface` (box / save_votes / email_capture / privy_modal
/ unknown), `component`, `auth_trigger`, `link_source`, `privy_loaded`, `privy_requested`,
`privy_host_failed`. The attempt id, elapsed time and error go in `extra`.

**a. Privy could not be loaded or started** (`sign_in_load_failed`, level error), with `extra.reason`:
- `chunk_load`: the Privy chunk failed to import (`AuthRoot`, next to `markHostFailed`).
- `never_ready`: Privy not started 20 s after the attempt began, whether slow, blocked or hung. This
  fires even if the visitor has not pressed anything yet.
- `call_timeout`: a sign-in call (`login`, `send_code`, `login_with_code`, `init_oauth`...) gave up
  waiting in `whenReady`; `extra.call` names it. Handled as before afterwards (swallowed for
  fire-and-forget calls, rethrown for headless ones). `getIdentityToken`'s bounded wait is not a
  sign-in and stays unreported.

**b. Prompt never appeared** (`sign_in_prompt_timeout`, level warning). An attempt begun with no box
or dialog opened (`openAuthAttempt`, which also sends `auth_prompt_viewed`) after 8 s. A superseded
or finished attempt is not reported. Visitors who leave send nothing: the timer dies with the tab.

**c. Code send never settled** (`sign_in_code_send_timeout`, level warning). In the account step's
`requestCode`, a send that has neither resolved nor rejected after 30 s. A send that rejects because
Privy never loaded is (a); other rejections (captcha, bad address) are visitor-level and stay in the
`auth_step` funnel.

### Alert rules to create (not created by this work)

In the web app's Sentry project, environment `production`, all notifying the team channel and Bryan:

- **"Sign-in failed to load"**: issue alert on message `sign_in_load_failed`, when a new issue is
  created or the issue changes state from resolved to unresolved. It should never happen, so the
  first event alerts. Action interval 1 hour.
- **"Sign-in not appearing"**: message `sign_in_prompt_timeout`, when the issue is seen 3 or more
  times in 24 hours (Sentry's "more than 2 times in 1 day"). Action interval 24 hours.
- **"Sign-in code not sending"**: the same, for `sign_in_code_send_timeout`.

Hourly thresholds would never fire at our traffic (33 marketing visitors in two days). The event's
tags say which entry point and surface broke.

## 2. Regression tests at the real seam

New test files under `apps/web/core/auth/` running the real `auth-hooks`, `auth-store`, `AuthRoot`,
`privy-host`, `DeepLinkHandler`, `SignInBoxHost` and account step. Only `@geogenesis/auth` is faked:
a Privy whose `ready` flips at a time the test picks (or never), whose `login` and `useLoginWithEmail`
are spies, built on the reviewer's repro. The telemetry logger is mocked to capture reports.

`core/auth/sign-in-seam.test.tsx`, for each entry point, marketing link
(`/explore?modal=signin&via=marketing`), navbar Log in, and the save-votes prompt (opened by a first
local vote):

- Privy ready after 5 s: the box is on screen within 1 s of the trigger, and after typing an address
  `sendCode` is called once Privy is ready, with no Sentry report.
- Privy never ready: the box still shows; exactly one `sign_in_load_failed` is reported, and the box
  falls back to its "Couldn't reach sign-in" message.

Plus: navbar Log in with no box host mounted reports `sign_in_prompt_timeout` exactly once. The
watchdog rules (once per attempt, superseded, closed, hidden tab, no open attempt) are unit tests in
`core/auth/sign-in-reports.test.ts`, and a Privy chunk that fails to import is
`core/wallet/auth-root.chunk-failure.test.tsx`.

**Against the 20 Oct build.** The marketing-link test's core assertion is written so it can run on
either version: within 8 s of landing, a sign-in prompt was viewed (`auth_prompt_viewed` captured or
Privy's `login` called). In a git archive of bd13e6b7c with the same fake Privy (the reviewer's repro
setup), that assertion fails when Privy starts after 25 s, and passes at 3 s. On this branch it
passes in both. Checked: the same assertion, on the reviewer's repro setup in an archive of
bd13e6b7c, passes at 3 s and fails at 25 s; on this branch the 25 s case passes.

## Possible follow-up: daily funnel-drop check

Not built. A daily job on the analytics warehouse (`events_for_metrics`, which already drops
headless traffic and `geo-signin-test-` accounts) comparing, per entry point, attempts started
(`auth_attempt_started`) against prompts shown (`auth_prompt_viewed`) and sign-ins
(`auth_attempt_completed` signed up or in) over a 7-day baseline, alerting on a drop to zero or a
large fall. It would catch breaks the browser cannot report, such as a link that stops starting
attempts at all. It would run as a Kubernetes CronJob in the analytics repo, like its existing
freshness checks.

## Out of scope

Google sign-in (flag off; the tags above already carry `sign_in_surface`, and `init_oauth` is
covered by (a)). Changing the 20 s wait itself.

Known gap: the save-votes sheet starts its attempt at the email submit, not when it opens, so a
sheet that never appears after a vote is not caught by (b). The follow-up above would catch it.
