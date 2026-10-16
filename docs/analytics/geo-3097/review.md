# Review follow-up

The review covered source discovery, graph scoping and pagination, claim timing, warehouse publication, reporting joins, scheduling and repository reuse.

## Findings fixed

- **Incorrect playback attribution:** the report treated a present-but-invalid position as usable. ClickHouse converted null and negative inputs to zero and accepted a numeric string. The new fixture cases failed against the original report, inflating opening/closing counts. The report now requires a finite, nonnegative JSON number and preserves all other values as unknown. Day buckets and range parameters explicitly use UTC.
- **Repeated speech matched to the wrong turn:** the shared resolver searches the supplied transcript and can select an earlier identical passage. The warehouse now supplies each eligible rendered speaker turn separately, using the existing resolver for matching and scoring. Exactly one candidate is required. Published offsets remain authoritative; ambiguous inferred timing stays unknown. Both new regressions failed against the original implementation.
- **Duplicated reader contracts:** the UI, timing scripts and warehouse built the same ontology variables separately. They now share `debateTranscriptClaimsVariables`. The GraphQL document accepts an optional page limit, including value lists; the warehouse no longer edits serialized GraphQL with string replacement. UI readers retain the existing default limit behavior.
- **Duplicated utilities:** source discovery now uses `collectCursorPages`; ID conversion uses `uuidToHex` and `hexToUuid`. The previous timing script's local UUID formatter was removed too. The superseded GEO-3073 round query was removed so there is one maintained reporting query, linked from both implementation guides.
- **Unvalidated transcript ordering:** Copilot correctly identified that `sequence_index` reaches the shared resolver's timestamp tie-breaker without runtime validation. The warehouse reader now requires a nonnegative safe integer on every segment before matching or publication. The other numeric ordering inputs were audited: transcript timestamps and rendered turn indices/bounds already reject malformed values. Valid zero, noncontiguous and out-of-order indices remain accepted; no coercion or new ordering algorithm was added to the shared matcher.

## Deliberate boundaries

The warehouse keeps its own strict HTTP/source validation and generation writer. The older ad hoc timing scripts use a fixed source environment and different failure behavior; sharing that transport would either weaken snapshot guarantees or expand this change into unrelated scripts. Timing resolution, round naming, transcript grouping, query/variable construction, cursor traversal and ID normalization are shared.

Copilot's proposed equality check between rendered and planned turn counts was rejected: the renderer deliberately omits zero-duration turns. That check would block valid snapshots. An independent completeness guarantee would require a service contract for expected rendered segments or duration; planned turn count cannot supply it. The reasoning and renderer evidence are recorded in the [review thread](https://github.com/geobrowser/geogenesis/pull/2645#discussion_r4140129322).

No remaining blocking code findings were identified. Production readiness still requires the documented schema/service-account/secrets setup, a scheduled refresh, a production report check and freshness monitoring. Those external steps were not performed as part of this code review.

## Verification

- 126 tests passed across eight relevant suites, including transcript grouping, timing, format rules, cursor traversal, source handling and snapshot publication.
- Typechecking and ESLint passed on the reviewed implementation.
- The actual reporting SQL passed synthetic ClickHouse checks, including malformed playback values, UTC parameter binding and an empty generation table.
- A complete public API dry run after the changes still found 102 debates, 508 turns and 1,167 claim occurrences, with zero unresolved imported claim rounds and four missing debate timelines.
- The repeated-transcript regressions were also run against the original implementation: both failed there and passed with the fix. The malformed-playback SQL fixtures likewise failed before the fix.
- Seven transcript-index regressions were written first and failed against the old reader, which published a generation for each malformed input. They passed with validation, failed again when both validation conditions were temporarily removed, and passed after restoration. These tests exercise the real reader and sync together, with mocked chat responses and decoded discovery data; no GraphQL transport is mocked. A positive case preserves valid zero/noncontiguous indices and tied timestamps.
