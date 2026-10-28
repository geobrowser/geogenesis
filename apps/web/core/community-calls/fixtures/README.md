# call_series_vectors.json

A byte-identical copy of geo-chat's `crates/debates/tests/fixtures/call_series_vectors.json`. geo-chat's
schedule expander is the reference: it generates the file, and its CI fails when the committed file is
stale. `occurrences.vectors.test.ts` checks the web expander against every case.

Never edit the copy by hand. When geo-chat changes the file:

```sh
bun scripts/refresh-call-series-vectors.ts ~/path/to/geo-chat
bunx vitest run core/community-calls/occurrences.vectors.test.ts
```

A failure caused by zone data, not logic, names both tzdb releases: the file's and the runtime's.
