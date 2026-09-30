# Upstream event registry and vendoring

`action_completed` and `component_impression` were registered upstream by
[analytics #90](https://github.com/geobrowser/analytics/pull/90), including the
exact required properties Genesis sends and the collector's generated Rust
definitions. Genesis now uses the unmodified upstream bundle and manifest.

The registry audit also found eight unregistered diagnostics: three social-video
preparation/handoff events and five debate-room ownership/reconnection events.
[Analytics #92](https://github.com/geobrowser/analytics/pull/92) registers their
existing producer contracts. Merge and deploy that collector before this bundle
ships. The vendored content hash is recorded in `geo-analytics-manifest.json`;
its upstream source commit is `8372245fcd2862d81eb194cd7d7df914ca9acf8c`.

## Updating the bundle

1. Register new events in the analytics repo's `semantic/events.yaml`. For
   versioned measurements, also add `semantic/measurement.yaml` contracts.
   This includes GEO-3071 sign-in attempts and abandons when their producer
   contracts are implemented; do not add event names only in Genesis.
2. In analytics, run `bun run semantic:generate`, `bun run semantic:check`, and
   `bun run build`. Run the relevant browser and collector contract tests.
   Merge the upstream change and deploy the collector before Genesis emits it.
3. In Genesis, run:

   ```sh
   bun run scripts/analytics/vendor.mjs /path/to/analytics
   bun run --filter @geogenesis/auth build
   cd apps/web
   bun run typecheck
   bun run test core/analytics-bundle.test.ts core/action-runtime.test.ts core/analytics.test.ts
   ```

The vendor command copies bytes unchanged, verifies upstream source and registry
hashes, updates the loader filename and SRI, removes the previous bundle, and
generates `AnalyticsEventName` from the vendored registry's Genesis events.
`capture` and forwarding helpers use that union, so an unregistered event name
fails typecheck. The bundle test checks the generated union against the actual
vendored registry, preventing a hand-edited type from bypassing registration.
Both checks already run in CI. Re-running the command with the same upstream
checkout must produce no changes.

`draft` is a semantic certification status, not an ingestion switch. Browser
validation returns the status but accepts valid events; the collector generates
event and measurement definitions for draft entries too. Browser and Rust tests
verify both events and every required attribution field. Keep the status until
the upstream certification process has the required deployed evidence.

## Production verification (pending deployment)

Run [compare-counts.sql](./compare-counts.sql) with `deployed_at` set to the UTC
time the Genesis bundle reaches production. It compares the complete 24 hours
before deployment with the complete 24 hours after, counts both events even if
one disappears, and reports missing required fields. Wait until the entire
after window has elapsed; partial windows are not comparable. Save the query
output and the deployment time on GEO-3094. A change in traffic can change raw
counts, so inspect any drop alongside page views rather than requiring equal
counts.

Also inspect collector rejection/dead-letter monitoring during those windows.
The ticket's reported pre-change evidence is 188 accepted events on September
29 with no missing attribution or dead letters; that is not a full-day baseline
and does not complete this comparison. Local tests cannot prove production
delivery. Keep this rollout verification pending until deployed evidence exists.
