# Debate rounds in the warehouse (GEO-3097)

The sync copies debate turns and claim occurrences into ClickHouse. [rounds.sql](rounds.sql) answers actions per day, debate, round, speaker, timing source and outcome in one warehouse query. Set its `from` and `to` parameters to UTC timestamps; the upper bound is exclusive. It counts canonical `action_completed` events once per operation within each bucket, with the same internal/account/automated-traffic exclusions as GEO-3073.

## Timing and attribution

- Turns use the service's rendered `output_start_ms` / `output_end_ms`, including yields and handoff grace. They never use planned durations or countdown starts. Round names come from the app's `debateTurnRole`; older four-turn formats still map correctly. Speakers come from the service's participant slot → personal space mapping.
- Claims use the app's resolver: published relation offsets (`exact`, confidence 1), a transcript match (`matched`, the resolver's score), then the source transcript block (`turn_only`, confidence 0). Missing timing remains `unknown` with null offsets. A block can only be located if its published text can be recovered in the transcript; relation position is not chronological and is never used to invent a turn.
- Each row represents a `(debate, publication space, block, claim)` occurrence. The sync groups each block separately, preserving statements made by multiple speakers or in multiple debates. Relation entity IDs are retained for auditing. Text is read for matching but not stored in the warehouse or logs.
- A claim action uses its claim's timing even if its playback position differs. An explicit action debate ID narrows the join; without one, every source debate is credited. Repeated claims can contribute to multiple round/speaker buckets. Do not sum those buckets to obtain a global unique-action count.
- Other video actions use their captured playback position and half-open turn intervals `[start, end)`. Missing positions, timeline gaps and positions beyond the recording are `unknown`, not opening. The query does not reconstruct a missing position from a later playback heartbeat.
- End-card actions are their own stage and have no speaker, including actions on a claim. They work even when no turn timeline is available. Claims that cannot be joined remain visible as `unknown`; their debate ID is empty if the action and graph supply none.
- Published offsets are recorded as exact provenance, not a guarantee that the publisher was correct. A block author that conflicts with the speaker at that offset produces an unknown round/speaker. Filter `timing_source` and `confidence` before aggregation as shown in the report. The match score measures lexical fit, not a calibrated probability.

The report starts at the rollout of canonical action events; it cannot recover missing legacy context. Correctly emitting and accepting `action_completed` remains a GEO-3073 collector dependency.

## Refresh and failure handling

`.github/workflows/debate-warehouse.yml` runs every six hours and supports manual dispatch. Discovery cursor-paginates every graph Debate entity, including old debates whose claims or offsets changed. Publication spaces come from the debate's transcript relations. All graph traversal hops remain space-scoped. Nested traversals fail at their explicit 1,000-row cap instead of silently truncating.

Each run appends a fresh generation to three input tables, then writes one commit marker only after every synchronous insert succeeds. Views and the report select the latest committed generation, independently of the warehouse's event generations. A failed read or write leaves the previous snapshot current. Reruns cannot duplicate the selected snapshot. Removals and corrected offsets appear on the next successful full refresh. There is no incremental watermark that could miss changes to a relation entity.

HTTP failures, invalid responses, GraphQL errors and malformed/overlapping turn boundaries fail the workflow. A genuine 404 is recorded as missing service/timeline coverage. An entirely empty catalog or a corpus with no timelines fails. A successful source read with no transcript still retains published claim offsets. Only a successful whole run advances freshness.

Use [health.sql](health.sql) for last-success age, debate coverage and unknown claim timing. Configure the warehouse monitor to alert when `stale = 1`; GitHub also reports failed workflow runs. GitHub scheduling can be delayed, so the six-hour cadence provides headroom within the one-day target, not a hard delivery guarantee during outages. Snapshots have no automatic TTL so an extended outage cannot erase the last good generation. Warehouse operators may prune old generations and abandoned writes, always retaining the newest committed generation. Storage grows with each full refresh.

## One-time deployment

This PR supplies code and a schedule; production setup is separate from merging it:

1. Using a warehouse migration account, run `schema.sql`, or from `apps/web` run `bun scripts/sync-debate-warehouse.ts --init-schema` with `CLICKHOUSE_URL`, `CLICKHOUSE_UN` and `CLICKHOUSE_PW`. This creates four namespaced tables and two views; it does not change the existing event pipeline.
2. Create a service account with INSERT on the four `analytics.debate_timing_*` tables. Analysts need SELECT on them (for the report) and on `analytics.debate_turns` / `analytics.claim_moments`. The scheduled account needs no event data or DDL privileges.
3. Set repository secrets `DEBATE_WAREHOUSE_CLICKHOUSE_URL`, `DEBATE_WAREHOUSE_CLICKHOUSE_UN`, `DEBATE_WAREHOUSE_CLICKHOUSE_PW`. The URL is the HTTPS ClickHouse HTTP endpoint, including its port. Do not put credentials in the URL.
4. Optional repository variables `DEBATE_WAREHOUSE_GRAPH_URL` and `DEBATE_WAREHOUSE_CHAT_URL` override the public testnet endpoints that currently back the Geo app. Both must refer to the same source environment.
5. After merge, dispatch the workflow and verify `health.sql`, then run the report for a known production date range. Install the freshness alert in the warehouse's monitor. Scheduled GitHub workflows run from the default branch.

Do not mark the production freshness criterion verified until secrets/schema setup and a scheduled run are confirmed. No production warehouse writes or repository secret changes were made while preparing this PR.

## Validation

From `apps/web`:

```sh
bun run test core/debates/warehouse.test.ts scripts/lib/debate-warehouse-source.test.ts scripts/lib/debate-warehouse-sync.test.ts core/debates/claim-timing.test.ts core/debates/formats.test.ts
bun run typecheck
bun scripts/sync-debate-warehouse.ts --dry-run
```

The dry run reads public APIs and prints counts only; it never connects to ClickHouse. On 29 September 2026 it found 102 debate entities, 508 rendered turns and 1,167 claim occurrences. All imported claims resolved to rounds; four debate entities lacked timelines. This checks source coverage, not production warehouse ingestion.

From the repository root, execute the real reporting SQL using only synthetic fixtures:

```sh
python3 scripts/analytics/test-rounds.py --url https://play.clickhouse.com/
```

The optional SQL test covers duplicate operation delivery, interval boundaries, missing/out-of-range playback positions, claim timing taking precedence over playback, reused claims, explicit unmatched debate IDs, end cards without timelines, traffic exclusion and an uncommitted snapshot. It can use a local ClickHouse HTTP endpoint instead.
