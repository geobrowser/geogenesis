# call_series_vectors.json

A byte-identical copy of geo-chat's `crates/debates/tests/fixtures/call_series_vectors.json`. geo-chat's
schedule expander is the reference: it generates the file, and its CI fails when the committed file is
stale. `occurrences.vectors.test.ts` checks the web expander against every case.

Never edit the copy by hand. When geo-chat changes the file:

```sh
bun scripts/refresh-call-series-vectors.ts ~/path/to/geo-chat
bunx vitest run core/community-calls/occurrences.vectors.test.ts
```

The file is generated with tzdb 2026e (geo-chat's bundled jiff-tzdb) and writes each zoned instant
with its local offset. When the runtime's tzdb differs, a case whose zone has other offsets at those
instants is skipped with a warning naming the zone and both releases; every other case is still
compared strictly.
