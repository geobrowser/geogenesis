# Signup visitor attribution (GEO-3095)

A new account's existing browser `signed_up` event now carries `signup_anonymous_id` and `signup_session_id`. Join it to the authoritative Privy creation record by `privy_user_id`. This gives the warehouse a deterministic bridge to logged-out activity without depending on another browser event after signup. The source-owned `identity_linked` event is unchanged; the browser does not impersonate that source.

The login press snapshots the runtime's visitor and session before authentication. A same-origin localStorage record retains only those two existing IDs and a start timestamp for up to 24 hours. Modal login and headless email verification both capture it. Code retries and resumed verification retain it; dismissal, logout and completion clear it. A deliberate new login replaces it. Shared storage supports completion in another tab or after an OAuth redirect. Storage restrictions fall back to memory for the current page.

`signup_context_source=auth_start` marks the saved snapshot, with `signup_started_at`. If no snapshot is available, `completion` marks the current runtime context read immediately before `signedUp` identifies the account, including when the analytics script loads late. `unavailable` makes missing IDs explicit. The canonical event's own visitor/session still describe completion; the new fields describe initiation. No email, token, wallet, URL, or arbitrary attribution properties are added to persistent storage.

If another tab reports a restored session, a pending snapshot is attached to the existing `session_restored` event only when Privy's account creation time falls within the attempt. Creation timestamps have second precision, so the comparison rounds the start down to that second. Existing accounts' restores are unchanged. This does not generate a synthetic signup or depend on `isNewUser` being true on a restored session.

## Reporting and coverage

Run [signup-journeys.sql](signup-journeys.sql) with `signup_day` (UTC Date) and the Genesis Privy `source_account_id` (String). The query uses the schemas in `geobrowser/analytics`: `analytics.privy_signups` selects source `user.created` records; `analytics.events_canonical` retains the new fields in `properties_json`. Source creation records are deduplicated by account. Links retain the visitor/session pair from one event and prefer initiation over completion context.

One query returns every new source account, its visitor and signup session, chronological page views and debate playback intervals from the preceding 30 days, plus daily totals and coverage percentages. History includes earlier sessions for the visitor, excludes signed-in activity and events at or after account creation, and deduplicates event IDs. Playback intervals are raw observed playback, not a qualified-view count. `missing_link` is separate from `no_observed_history`; the latter means no recorded history in the lookback, not proof that this was someone's first-ever visit.

The source-based denominator includes accounts with no browser telemetry at all. Use a source account scoped to Genesis signups when evaluating the 95% target. If that Privy source is shared with other applications, its percentage is a broader diagnostic; source-side app attribution is required for the exact in-app denominator. The observed-app percentage is also shown but cannot detect entirely missing browser completions. Do not use it alone to claim the target is met.

## Validation and rollout

Tests cover delayed email completion, module reload/OAuth return, a separate tab, new-account restoration, existing-account restoration, duplicate observers (existing tracker tests), cancellation/logout, expiry, malformed or blocked storage, resumed verification, disabled analytics and a late runtime. The runtime integration test executes the shipped bundle and inspects the actual OTLP collector payload against the preceding page view.

The report is additive and does not rewrite historical identity records. Existing source-only records cannot be reliably backfilled without browser evidence. Deploy this app change, confirm that the collector retains the fields in canonical rows, then run the report after the 24-hour completion window. Publish the daily coverage columns in the analytics dashboard/scheduler and alert on `coverage_below_target`. Dashboard infrastructure and production warehouse access are outside this repository; production ingestion, dashboard installation and the >=95% result are rollout checks, not claims established by local tests.

Cross-device login, a different origin, browser storage clearing, withheld analytics consent and a closed tab before delivery can prevent attribution. Simultaneous attempts in one browser share the latest initiating snapshot. This is browser-observed attribution, not a cryptographically verified identity-binding receipt.

Keep the Linear ticket In Progress during draft review. Move it to Done when Preston confirms the PR was merged.

The report passed against synthetic fixture CTEs on ClickHouse's public playground. This runs the actual report with substituted fixture tables and checks earlier sessions, playback, duplicates, preference for the initiating snapshot, restored signup, absent history, missing links and both coverage denominators. It sends no production data or credentials:

```sh
python3 scripts/analytics/test-signup-journeys.py --url https://play.clickhouse.com/
```
