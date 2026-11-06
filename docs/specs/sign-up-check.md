# Sign-in failure reporting (GEO-3571)

From 20 to 22 Oct the marketing "Sign in / Sign up" link opened nothing, and nothing told us. This
adds three things: Sentry reports from real visitors' browsers when sign-in fails to appear or to
send a code, regression tests at the seam that broke, and (design only) a daily funnel-drop check
on the analytics warehouse. No synthetic accounts, nothing run against production.

## What broke

At bd13e6b7c (#2930) a signed-out visitor got `ready: true` from the auth shim at once
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

Shared tags, from the current auth attempt (`core/auth-attempt.ts`), low cardinality only:
`sign_in_surface` (box / save_votes / email_capture / privy_modal / unknown), `component`,
`auth_trigger`, `link_source`, `privy_loaded`, `privy_requested`. The attempt id and elapsed times go
in `extra`. Built by one small helper in `core/auth/` so every report carries the same set.

**a. Load and invoke failures** (`sign_in_load_failed`, exception, level error). Where
`invokeInstance`/`invokePrivy` hand a call to `whenReady`, a rejection is reported once, tagged with
the call (`login`, `send_code`, `login_with_code`, `init_oauth`, `logout`...), then handled as it is
today (swallowed for fire-and-forget calls, rethrown for headless ones). Also reported: the Privy
chunk failing to import (`markHostFailed`). `getIdentityToken`'s bounded wait is not a sign-in and
stays unreported.

**b. Prompt never appeared** (`sign_in_prompt_timeout`, message, level warning). `beginAuthAttempt`
arms an 8 s timer for that attempt. `openAuthAttempt` (the box or dialog on screen, which already
sends `auth_prompt_viewed`) and `finishAuthAttempt` disarm it. If it fires while the attempt is
still current, unopened and unfinished, one event is sent with the tags above and `elapsed_ms`.
Visitors who leave send nothing: the timer dies with the tab, and it is disarmed if the page becomes
hidden before the deadline (a background tab throttles rendering, so a late box there is not a bug).
One timer per attempt, so at most one event per attempt.

**c. Code send never settled** (`sign_in_code_send_timeout`, message, level warning). In the
account step's `requestCode` (`partials/explore/email-capture-account-step.tsx`), a send that has
neither resolved nor rejected after 30 s sends one event per attempt (tags above, `elapsed_ms`). A
send that rejects is already covered by (a) when Privy never loaded; other rejections (captcha, bad
address) are visitor-level and stay in the `auth_step` funnel only.

### Alert rules to create (not created by this work)

In the web app's Sentry project, environment `production`:

- **"Sign-in not appearing"**: issue alert on message `sign_in_prompt_timeout`, when the issue is
  seen more than 3 times in 1 hour; notify the team channel and Bryan; action interval 1 hour.
- **"Sign-in failed to load"**: same, for issue `sign_in_load_failed`.
- **"Sign-in code not sending"**: same, for `sign_in_code_send_timeout`.

The alert's event shows the tags, so the notification says which entry point and surface broke.
The threshold of 3 is a starting point: one slow phone network should not page, and the 20 Oct
break hit every marketing visitor (33 in two days).

## 2. Regression tests at the real seam

New test files under `apps/web/core/auth/` running the real `auth-hooks`, `auth-store`, `AuthRoot`,
`privy-host`, `DeepLinkHandler`, `SignInBoxHost` and account step. Only `@geogenesis/auth` is faked:
a Privy whose `ready` flips at a time the test picks (or never), whose `login` and `useLoginWithEmail`
are spies, built on the reviewer's repro. The telemetry logger is mocked to capture reports.

For each entry point, marketing link (`/explore?modal=signin&via=marketing`), navbar Log in, and the
save-votes prompt (open after a first local vote):

- Privy ready after 5 s: the box is on screen within 1 s of the trigger, and after typing an address
  `sendCode` is called once Privy is ready, with no Sentry report.
- Privy never ready: the box still shows; submitting reports `sign_in_load_failed` with
  `call: send_code` and the entry's tags once the 20 s wait ends, and the box falls back to its
  "sign-in unavailable" message.
- The attempt opened but no box rendered (a box host not mounted): `sign_in_prompt_timeout` after
  8 s, exactly once.

**Against the 20 Oct build.** The marketing-link test's core assertion is written so it can run on
either version: within 8 s of landing, a sign-in prompt was viewed (`auth_prompt_viewed` captured or
Privy's `login` called). In a git archive of bd13e6b7c with the same fake Privy (the reviewer's repro
setup), that assertion fails when Privy starts after 25 s, and passes at 3 s. On this branch it
passes in both. I'll run it in both trees and paste both results in the PR.

## 3. Daily funnel-drop check (design only)

Runs in the analytics repo, the way its other health checks run: a Kubernetes CronJob in
`infra/kubernetes/` (as `debate-warehouse-freshness-cronjob.yaml`), with a ClickHouse user that can
read only `analytics.events_for_metrics`. That view already drops headless/Playwright traffic and
accounts labelled by `ops/labels/privy-account-rules.json` (`geo-signin-test-`).

Daily at 07:00 UTC, for the previous UTC day, per entry point (marketing link, navbar, save-votes,
other), counting attempts by `auth_attempt_id` with the entry-point definition `signin-steps.sql`
already uses:

- **started**: `auth_attempt_started`
- **shown**: `auth_prompt_viewed`
- **signed in**: `auth_attempt_completed` with outcome `signed_up` or `signed_in`

against the mean of the 7 days before it. It alerts when, for an entry point with at least 5 starts
a day on average over the baseline:

- shown or signed in is 0 while started is above 0 (the 20 Oct pattern); or
- shown/started or signed-in/started falls below half of its baseline ratio; or
- started falls below a quarter of its baseline (a link that stopped starting attempts at all).

Alerting: the Job exits non-zero, so the cluster's existing `KubeJobFailed` alert fires as it does
for the other freshness jobs, and it also posts one Sentry message (`sign_in_funnel_drop`, tagged by
entry point and which rule tripped) to the web project through the DSN's store endpoint, so all
sign-in alerts land in one place. Where `KubeJobFailed` routes is not in the repo; to confirm when
that worktree starts.

## Out of scope

Google sign-in (flag off; the tags above already carry `sign_in_surface`, and `init_oauth` is
covered by (a)). Changing the 20 s wait itself. The analytics repo change, which gets its own branch.
