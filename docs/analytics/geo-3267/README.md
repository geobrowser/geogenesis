# Shared-link acquisition (GEO-3267)

Existing debate copy/X/LinkedIn/Reddit controls, lobby copy controls, and availability copy controls now share tagged destinations. Downloads and native file sharing keep their existing behavior. New claim controls, caption links, and video end cards remain follow-up work.

Each link carries `utm_source=<method>`, `utm_medium=share`, `utm_campaign=geo_share`, and `utm_content=v1:<debate|lobby|availability>:<content UUID>:<share UUID>`. UUIDs are lowercase and dashless. A new share replaces inherited campaign tags while preserving destination parameters and fragments. Canonical/OG metadata uses the existing untagged destinations.

The random share ID joins an arrival to `share_link_handoff`. The sharer's profile ID appears only on that outbound event, never as an additional tracking tag. An availability link identifies the calendar owner in its path/content ID; the person copying it may be someone else. Unmatched arrivals still count with unknown sharer identity.

The debate X composer uses X's `twitter-text` parser for weighted text counting, including Unicode, emoji and embedded URLs. It reserves the destination link's 23-character weight plus its separator and keeps the tagline when shortening the claim. Text is normalized to NFC and shortened only at grapheme boundaries. LinkedIn keeps its existing 700-character caption allowance independently of the destination URL. The debate dialog loads on demand from both feed entry points, keeping the parser behind that boundary. Loading finishes before the composer button is available, so `window.open` stays synchronous with its click.

The profile trait is read only when the existing analytics context explicitly reports `is_identified: true`. False means anonymous; unavailable context means unknown, with no profile trait read. This uses the existing runtime enablement and identity-revision guard: a completed clipboard write cannot send a stale actor after logout/account switching. The anonymous browser ID still accompanies identified events, as it does elsewhere in the runtime, so auth/session evidence can be joined. No profile lookup or extra identification occurs on the sharing path.

`composer_requested` means the app attempted to open a composer, not that a popup opened or a post was published. With `noopener,noreferrer`, a successful `window.open` may return `null`; that return value cannot distinguish a blocked popup. The canonical action keeps its outcome unknown. Lobby copy controls intentionally generate a fresh share UUID per successful handoff and display the exact copied URL; the lobby destination stays the same.

## Weekly report

Use ClickHouse 26.3 or newer with `enable_materialized_cte` (tested against production 26.6.1.2326 and embedded 26.9.2.1). The report caches shared intermediate results within its SELECT, including the projected event fields, to avoid repeatedly scanning warehouse history or retaining unrelated JSON. These are query-local caches; the query creates no persistent objects.

Run `weekly.sql` against the existing analytics warehouse with Date parameters `start_date` (inclusive) and `end_date` (exclusive). Dates and Monday-start weeks use UTC. For example:

```sh
clickhouse client --param_start_date=2026-10-12 --param_end_date=2026-10-19 \
  --queries-file=docs/analytics/geo-3267/weekly.sql
```

The query returns two breakdowns. `channel` rows are the weekly totals; `sharer` rows show the same metrics by known profile and role. Choose one breakdown when displaying totals. Distinct visitor counts across sharers are not additive.

| Metric                                | Definition                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `visits`                              | Distinct visitor/session pairs with a valid share-tagged landing, by landing week.                                        |
| `visitors`                            | Distinct initiating anonymous IDs within the row's group; this is browser identity, not a count of people across devices. |
| `new_accounts`                        | Distinct observed `signed_up` account IDs, by creation week, joined to the auth attempt's initiating acquired session.    |
| `link_handoffs`                       | Distinct outbound share IDs first handed off that week. Composer requests count as requests, not confirmed posts.         |
| `matched_visits` / `unmatched_visits` | Visits with/without a matching outbound share event and matching channel/content.                                         |

Events, acquired sessions, auth links, and accounts are deduplicated before aggregation. The query retains historical handoffs to recognize old links bringing traffic this week, and historical sign-ups to suppress duplicate account callbacks. It reads retained event history; delivery gaps and retention limits can reduce attribution coverage.

The report joins account creation through existing GEO-3071 attempt IDs and initiating anonymous/session IDs, including recovered auth flows. Another tab or campaign at completion cannot replace that starting session. Ambiguous pairs stay uncredited, including callbacks without an attempt ID: action and auth-start snapshot references must identify exactly one distinct complete pair. Matching references count as one pair; incomplete references and signup snapshots from completion do not compete with valid initiating evidence. Sign-ins, session restores, and newsletter submissions are not new accounts. A later direct session does not inherit share credit. An acquired visit may occur the week before its account creation.

Team/test/automated events, their known sessions/attempts/shared links, and labeled accounts are excluded. Label reads use `FINAL` so the latest version of a removed label takes effect before filtering. Identifiable self-visits are excluded by comparing the sender's anonymous/account identity with the acquired session. Anonymous self-visits across devices cannot be recognized.

Exclusions also follow a later sign-in/session restore and the initiating auth IDs recovered in another tab. A team sender's earlier anonymous handoff is excluded with its session, so its arrivals cannot reappear as unmatched growth.

The reporting dates bound metric occurrences, not the identity evidence used for exclusions. Rerunning an earlier week can therefore remove team/self traffic identified after that week ended. Later handoffs, visits and account creation do not enter the earlier week's metrics.

Self-visit filtering also uses explicit initiating-auth links when sign-in completes in another tab or campaign. Account evidence from sign-in, sign-up, identity-link and recovered restore events joins only the recorded initiating visitor/session pair. A conflicting source pair or account leaves the link ambiguous; it cannot remove a visit as self-traffic or assign a conversion. Another session with the same anonymous ID does not inherit this identity inference.

An anonymous sender can also be identified after the handoff, including after the reporting week. The comparison reuses the same session-account evidence for the handoff's exact visitor/session pair, and infers a sender account only when that session has one known account. An account recorded at handoff remains authoritative if the sender later switches accounts. Later identification affects self-visit filtering without rewriting the handoff's profile or role.

Missing outbound events do not erase acquired visits/accounts, but their sharer stays unknown. Lost sign-up events or initiating joins cannot prove conversion. There is no visits/share ratio: dividing arrivals this week by shares this week would mix cohorts. Seven-day cohort reporting remains follow-up scope.

## Validation and rollout

Release in this order:

1. Merge [analytics PR #114](https://github.com/geobrowser/analytics/pull/114), then deploy its generated registry to the Rust collector. The Vercel analytics-dashboard preview is a separate deployment and does not establish collector readiness.
2. Confirm a canary `share_link_handoff` passes the deployed collector's validation and persists with its share ID and actor fields. The native `analytics-core` test `share_link_handoffs_validate_for_anonymous_and_identified_senders` proves acceptance of both sender forms by the proposed registry; it is not proof of the deployed collector version.
3. Only then release [Genesis PR #2910](https://github.com/geobrowser/geogenesis/pull/2910). The browser bundle is built upstream and vendored unchanged using `bun run scripts/analytics/vendor.mjs /path/to/analytics`; generated names and integrity hashes must match it.
4. Check desktop/phone clipboard and social composers, then a new-account flow. Inspect matching share IDs and one account conversion, and rerun the report after snapshot publication.

Run the SQL against isolated synthetic ClickHouse tables:

```sh
CLICKHOUSE_BINARY=/path/to/clickhouse bun run docs/analytics/geo-3267/weekly.test.ts
# An existing Python environment with chdb can supply the same SQL engine:
CHDB_PYTHON=/path/to/python-with-chdb bun run docs/analytics/geo-3267/weekly.test.ts
```

`.github/workflows/share-link-report.yml` runs this fixture on report changes, using Python 3.12 and pinned `chdb==4.4.0`. It needs no production credentials. The fixture covers duplicate handoffs/sign-ups, repeated views, two shares of the same content, prior-week acquisition, new-tab auth completion, campaign changes, missing outbound events, direct returns, ambiguous auth links, and self/team/test exclusions. A native execution-plan assertion bounds warehouse source reads to one per input. Removing the event cache fails that assertion. A removed-label fixture also fails without `FINAL`.

`fixture-schema.sql` projects the exact production types consumed from `events_canonical`: DateTime64(3, 'UTC'), LowCardinality event/app/environment, nullable identity strings and string properties. It omits unused columns and replaces the production canonical view with a MergeTree fixture for deterministic source-scan checks. The labels fixture preserves the full upstream definition and ReplacingMergeTree version/key behavior; production uses SharedReplacingMergeTree. Background fixture merges are disabled so the label-version regression cannot pass accidentally after a merge. The definitions are pinned to upstream migrations, and the read-only check below prints the live types and table engines to expose drift.

Vitest tests execute the exact vendored runtime and verify actual collector serialization alongside the share controls. Component and isolated bundle tests protect the deferred dialog boundary; that bundle test is scoped to the sharing sources and is not a measurement of the entire Next.js Explore chunk.

## Read-only warehouse check

Use the existing warehouse connection, with credentials in the existing env file. Bun's env-file parser handles quoted values; do not echo credentials or put them in the URL.

```sh
CLICKHOUSE_URL=https://your-existing-clickhouse-host:8443 \
  bun --env-file=/absolute/path/to/existing.env run \
  docs/analytics/geo-3267/warehouse-check.ts 2026-10-12 2026-10-19
```

The helper reads `CLICKHOUSE_UN` / `CLICKHOUSE_PW`, enforces read-only queries, and bounds execution to 60 seconds, two threads and 2 GiB, with external aggregation above 128 MiB. It checks `max(published_at)` in `input_generations` first, then prints the consumed schema, engines, elapsed report time and rows. It does not require `system.query_log`, the `format()` table function, or explicit temporary tables. `events_canonical` is a published snapshot, roughly an hour behind raw delivery; use `events_raw` for acceptance evidence in the last hour. A completed-week report uses canonical data, with later identity evidence only as fresh as the recorded publication time.

Production check on 2026-10-19, for `[2026-10-12, 2026-10-19)` UTC:

```json
{
  "checked_at": "2026-10-19 22:38:00",
  "published_at": "2026-10-19 21:53:30.794",
  "clickhouse_version": "26.6.1.2326",
  "report_elapsed_ms": 46565,
  "rows": []
}
```

The report completed in 46.6 seconds, within the 60-second bound. All consumed column types matched the fixture; production engines were View and SharedReplacingMergeTree. An empty result means no qualifying rows for that week, not proven end-to-end delivery. The initial unoptimized report timed out; shared-input caching and field projection let the production query complete. The collector deployment and post-release device/new-account checks above remain release gates.
