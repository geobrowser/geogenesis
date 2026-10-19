# Shared-link acquisition (GEO-3267)

Existing debate copy/X/LinkedIn/Reddit controls, lobby copy controls, and availability copy controls now share tagged destinations. Downloads and native file sharing keep their existing behavior. New claim controls, caption links, and video end cards remain follow-up work.

Each link carries `utm_source=<method>`, `utm_medium=share`, `utm_campaign=geo_share`, and `utm_content=v1:<debate|lobby|availability>:<content UUID>:<share UUID>`. UUIDs are lowercase and dashless. A new share replaces inherited campaign tags while preserving destination parameters and fragments. Canonical/OG metadata uses the existing untagged destinations.

The random share ID joins an arrival to `share_link_handoff`. The sharer's profile ID appears only on that outbound event, never as an additional tracking tag. An availability link identifies the calendar owner in its path/content ID; the person copying it may be someone else. Unmatched arrivals still count with unknown sharer identity.

## Weekly report

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

The report joins account creation through existing GEO-3071 attempt IDs and initiating anonymous/session IDs, including recovered auth flows. Another tab or campaign at completion cannot replace that starting session. Ambiguous pairs stay uncredited. Sign-ins, session restores, and newsletter submissions are not new accounts. A later direct session does not inherit share credit. An acquired visit may occur the week before its account creation.

Team/test/automated events, their known sessions/attempts/shared links, and labeled accounts are excluded. Identifiable self-visits are excluded by comparing the sender's anonymous/account identity with the acquired session. Anonymous self-visits across devices cannot be recognized.

Exclusions also follow a later sign-in/session restore and the initiating auth IDs recovered in another tab. A team sender's earlier anonymous handoff is excluded with its session, so its arrivals cannot reappear as unmatched growth.

Missing outbound events do not erase acquired visits/accounts, but their sharer stays unknown. Lost sign-up events or initiating joins cannot prove conversion. There is no visits/share ratio: dividing arrivals this week by shares this week would mix cohorts. Seven-day cohort reporting remains follow-up scope.

## Validation and rollout

Register and deploy the collector contract from [analytics PR #114](https://github.com/geobrowser/analytics/pull/114) before releasing the Genesis producer. The browser bundle is built upstream and vendored unchanged using `bun run scripts/analytics/vendor.mjs /path/to/analytics`; generated event names and integrity hashes must match it.

Run the SQL against isolated synthetic ClickHouse tables:

```sh
CLICKHOUSE_BINARY=/path/to/clickhouse bun run docs/analytics/geo-3267/weekly.test.ts
# An existing Python environment with chdb can supply the same SQL engine:
CHDB_PYTHON=/path/to/python-with-chdb bun run docs/analytics/geo-3267/weekly.test.ts
```

The fixtures cover duplicate handoffs/sign-ups, repeated views, two shares of the same content, prior-week acquisition, new-tab auth completion, campaign changes, missing outbound events, direct returns, ambiguous auth links, and self/team/test exclusions. Vitest tests execute the exact vendored runtime and verify actual collector serialization alongside the share controls.

Production acceptance still needs desktop/phone clipboard and social-composer checks plus a new-account flow. Inspect collector rows for matching share IDs and a single account conversion, and run the weekly query after deployment. Local fixtures verify query behavior; they do not establish production delivery.
