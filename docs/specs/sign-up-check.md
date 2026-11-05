# Sign-up check (GEO-3571)

A scheduled browser check that signs up a brand-new visitor on production through each sign-in
entry point, and reports a Sentry event naming the path that broke.

## What runs

One Playwright test per path, in `apps/web/e2e/sign-up-check/`, under its own config
(`playwright.sign-up-check.config.ts`): Chromium only, one worker, no `webServer`, `baseURL` from
`SIGN_UP_CHECK_URL` (default `https://www.geobrowser.io`).

| Path id          | Opens                                   | How the box is reached                           |
| ---------------- | --------------------------------------- | ------------------------------------------------ |
| `marketing_link` | `/explore?modal=signin&via=marketing`   | Opens on load (`useSignInDeepLink`)              |
| `navbar_login`   | `/explore`                              | Press navbar "Log in"                            |
| `save_votes`     | `/explore`                              | Cast one vote on a feed card; the save-votes sheet opens after the first vote |

Each path runs in a fresh browser context (no storage, so a new visitor), then:

1. **box_shown**: our sign-in box (`Sign in box` form, or the save-votes card's account step) is
   visible within 30 s. Time from navigation to visible is recorded.
2. **code_sent**: enter a fresh throwaway address, submit, the code step appears.
3. **code_received**: poll the inbox for the code (up to 120 s).
4. **signed_in**: enter the code; the app shows the visitor signed in: the navbar "Log in" button is
   gone and onboarding's profile step is up (a brand-new account always lands there). Time from
   navigation to signed in is recorded.
5. **account_exists**: the page holds a Privy access token whose subject is a `did:privy:` id, and
   Privy's identity token for it lists the address we signed up with (both read from the page, no
   server secret).

Provider is a parameter of each path (`email` now). Google is a second provider implementation
added after GEO-3583; the steps above stay the same, only 2 and 3 differ.

### How far it goes

It stops at onboarding's profile step. Finishing onboarding creates a personal space on-chain and
publishes a profile, which is slow, costs gas and adds a public entity per run. Not worth it.

The `save_votes` path casts one local vote before signing in, and `LocalVotesSaver` would publish
it once the account is set up. The check removes the vote (press the same pill again) before
submitting the code, so nothing is published; the sheet stays open. If removing it turns out to
close the sheet, the fallback is to stop that path at `signed_in` and close the tab before the
saver can run (it waits on the personal space, which never exists for these accounts).

**Created per run, per path:** one Privy user with an email account and an embedded wallet (Privy
side only; the smart account is counterfactual, nothing on-chain), and whatever geo-chat records at
sign-in. No Geo entities, no space, no votes.

**Volume:** about 3 accounts per production deploy plus 3 per daily run. At ~10 deploys a day that
is ~1,000 accounts a month. Privy bills by monthly active users, so this needs Bryan's OK on cost.
Levers if it is too many: one run per hour of deploys (GitHub `concurrency` plus a skip when the
last successful run is under an hour old), or running `navbar_login` and `save_votes` daily only.

**Cleanup:** accounts are kept, not deleted. Deleting through Privy's API needs the app secret in
GitHub, and would race the analytics Privy ingest, which is what applies the exclusion label below.
They are bounded by volume, findable by email prefix, and can be bulk-deleted later.

## Keeping test accounts out of metrics

Checked against `analytics` main (c995517):

- Every metric reads `analytics.events_for_metrics`, including the sign-in funnel
  (`docs/analytics/signin-steps.sql`, `auth_step`). The view does **not** filter on the
  `is_automated` property. It does drop events whose user agent contains `headless` or `playwright`,
  and events of accounts with an active `exclude_from_metrics` row in `privy_account_labels`.
- `ops/labels/privy-account-rules.json` already has rule `signup-tests`: any Privy account whose
  email local part starts with `geo-signin-test-` is labelled `test` and excluded, applied every
  5-minute dashboard refresh, capped at 100 new labels per run.

So the one label is the email prefix: every address is `geo-signin-test-<run id>-<path>@<mail.tm
domain>`. That covers events tied to the account, including server-side ones with no user agent
(Privy webhook `signed_up`). Events from before the account exists (page views, the funnel's early
`auth_step` steps) are anonymous; those are dropped by the user-agent filter. The check keeps
Playwright's `HeadlessChrome` user agent and appends ` geo-sign-up-check`, so it stays caught even if
the browser stops sending `HeadlessChrome`.

No analytics repo change is needed. One gap to note, not fix here: the 100-label cap is per refresh,
far above this check's rate.

## Throwaway inbox

mail.tm API (domains, create account, token, list messages, read message). mail.gw is the same API
on other domains and is the fallback. Each inbox call retries 3 times with backoff on 429/5xx.

Failure reasons are distinct so a bad inbox never pages as broken sign-up:

| Reason             | Means                                              | Pages? |
| ------------------ | -------------------------------------------------- | ------ |
| `inbox_unavailable`| Both providers failed to create an inbox or answer | No: warning event, own fingerprint |
| `box_not_shown`    | No sign-in box within 30 s                         | Yes    |
| `code_not_sent`    | Submit never reached the code step, or showed an error | Yes |
| `code_not_received`| Inbox answers, no code in 120 s, after one retry of the path on the other provider | Yes |
| `code_rejected`    | Code entered, not signed in within 30 s            | Yes    |
| `account_missing`  | Signed-in UI but no matching Privy session         | Yes    |

`code_not_received` is a real failure when the inbox works (Privy's email or our Privy config), so
it pages, but only after the second provider also got nothing. A path that fails once at any step is
retried once from scratch; it reports only if the retry also fails, with the retry's reason.

## Alerts (Sentry)

The runner (`@sentry/node`, DSN from a `SENTRY_SIGN_UP_CHECK_DSN` secret) sends one event per
failed path after its retry:

- message `Sign-up check failed: <path> (<reason>)`, level `error` (`warning` for `inbox_unavailable`)
- fingerprint `['sign-up-check', <path>]` (`['sign-up-check', 'inbox']` for the inbox)
- tags `check=sign-up`, `path`, `reason`, `provider`, `trigger` (`deploy`/`schedule`), `sha`
- context: timings, the GitHub run URL (screenshots and trace are uploaded there as artifacts)

Plus a Sentry Cron Monitor check-in (`sign-up-check`, daily schedule, 2 h margin) so a check that
stops running alerts too.

**Alert rule to create** (not created by this work), in the project the DSN belongs to:

- Issue alert "Sign-up broken": when *a new issue is created* OR *the issue changes state from
  resolved to unresolved* OR *the issue is seen more than 0 times in 1 hour*; filter tag `check`
  equals `sign-up` and level equals `error`; action: notify the team channel and Bryan; action
  interval 60 minutes.
- The cron monitor's built-in missed/failed check-in alert, same recipients.

The issue title carries the path, so the notification names what broke. Each path is its own issue
because of the fingerprint.

## Triggers

Vercel posts GitHub deployments to `geobrowser/geogenesis` as `vercel[bot]`, environment
`Production`, with a `success` status whose `environment_url` is the deployment URL. Workflow
`.github/workflows/sign-up-check.yml`:

- `deployment_status`, running only when `state == 'success'` and environment is `Production`.
  It targets the canonical production domain, not the deployment URL: Privy only allows our real
  origins, and the domain is what visitors see. Vercel assigns the domain before it reports a
  production deployment successful, so no wait is needed; the run records the sha it was triggered
  for.
- `schedule` once a day (14:00 UTC), and `workflow_dispatch` with an optional URL.
- `concurrency: sign-up-check`, not cancelling in progress, so deploys in a burst queue up rather
  than run in parallel.

"Within an hour": a deploy-triggered failure reports in ~10 minutes. A break between deploys (a
third-party setting) is caught by the daily run only; an hourly schedule would meet the hour for
those too at ~70 extra accounts a day. Daily is the default; Bryan's call.

Timings (load to box, load to signed in, per path) go to the job summary and a JSON artifact, for
GEO-3551.

## Replaying 20 Oct (criterion 5)

Build `bd13e6b7c` (#2930) locally with production-like env, `next start`, run the check with
`SIGN_UP_CHECK_URL=http://localhost:3000` and `marketing_link` only. Expected: `box_not_shown`.
That build predates our box (its sign-in was Privy's window), so for this replay the check also
accepts Privy's dialog as "box shown"; the bug was that neither appeared. As the control, the same
run against a local build of `da444dce4` passes `box_shown` (it needs a Privy app that allows
localhost, so the dev app id; sign-up is optional there). Both results go in the PR.
