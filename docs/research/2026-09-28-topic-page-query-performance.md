# Topic page query performance

Measured on 2026-09-28 against `https://api-testnet.geobrowser.io/graphql` for AI Safety (`70040a3de7934b658f85b04893e95ab0`). Starting the population query from incoming Topics relations produced the largest repeatable improvement in first-request samples. The fixed entity-type filter is retained.

## Method

Used the application's query documents, predicates, decoders, and feed builder from Bun. Timed HTTP responses through body download and timed each complete feed/facet call. No database or API caches were cleared; first requests are not guaranteed cold. These are local-to-API measurements, not browser navigation or production server timings.

The scope was the signed-out featured-space list plus the route space, assembled by `fetchBrowseSidebarData(null)`:

- `224406e0de3c48d78ef12774111b8b2f`
- `41e851610e13a19441c4d980f2f2ce6b` (route space)
- `4582fbbee28a16589154f7e36f1ee3c5`
- `52c7ae149838b6d47ce0f3b2a5974546`
- `89bd89bf28ff8a0963faf92a8c905e20`
- `c9f267dcb0d270718c2a3c45a64afd32`

The old debate predicate came from master `3dc2478e5`; the direct-topic entity-first predicate came from `d6568d3db`. Both used the same current dataset and fixed content-type list. The new relation-first query applies the full existing entity predicate to `fromEntity`, including type, space, name, exclusions, and additional selected topics. All population queries were paginated to completion and entity IDs deduplicated before comparison.

## Debate-to-topic change

Three alternating comparisons of the old two-branch population lookup with the direct-topic entity lookup:

| Sample | Old claim traversal | Direct Topics | Unique entities |
| --- | ---: | ---: | ---: |
| First | 2,996 ms | 2,686 ms | 147 each |
| Repeat 1 | 192 ms | 184 ms | 147 each |
| Repeat 2 | 239 ms | 131 ms | 147 each |

This supports a modest improvement and one fewer population request. It does not support attributing a large page-load improvement to that change alone. Facets also lose a separate debate/claim traversal; their timings varied enough that a stable speedup should not be claimed.

## Relation-first population lookup

| Population | Entity-first | Relation-first | Unique entities | Exact ID-set match |
| --- | ---: | ---: | ---: | --- |
| AI Safety, all allowed types | 3,205 ms | 189 ms | 147 | Yes |
| AI Safety, debates | 2,660 ms | 136 ms | 6 | Yes |
| AI Safety, claims | 2,726 ms | 190 ms | 135 | Yes |
| AI Safety AND AI governance | 2,811 ms | 150 ms | 33 | Yes |
| AI governance, all allowed types | 2,735 ms | 647 ms | 473 | Yes |

AI governance is `ced61de0068c41ffb90f63ed942fef94`. Its relation query required two cursor pages because multiple relations can point from the same entity. This is why the implementation exhausts relation pages and deduplicates entities before ranking/counting.

The first comparison ran entity-first before relation-first; the remaining four ran relation-first first. AI Safety repeats were approximately 103–117 ms for entity-first and 106–109 ms for relation-first. The improvement is most visible when the entity-first query has not just been requested.

The implemented path (including the full nested predicate) fetched AI Safety's population in 151 ms. Its full feed call took 1,919 ms versus 3,484 ms for the old path, with the exact same 22 card IDs in the same order. Card-fetch cache state differed, so those full-feed samples are illustrative rather than a controlled speedup ratio.

## Other costs and rejected changes

- Featured-space discovery took 1,578–1,656 ms initially and 117–190 ms with the existing shared featured cache. It remains a prerequisite for the signed-out request context.
- The Best feed hydrates 66 candidate cards before serving 22. This transferred about 150 KB and took 1,743–2,934 ms in first samples, versus roughly 194–556 ms on repeats. Reducing this work would require preserving type diversity, display-space selection, and pagination.
- Changing card hydration from creation-time to ID ordering returned the same 66 IDs but did not show a convincing improvement; it is not included.
- Removing the fixed type list was tested earlier against the topic's two listed spaces: 3,379 ms filtered versus 3,017 ms unfiltered, with both repeats around 145 ms. It also broadened results from 191 to 194 entities. That change was reverted.

The shipped change targets population lookup. It preserves the existing card hydration, ranking, pagination, type menu, and space scope. Browser rendering, route/server-component loading, signed-in membership lookups, and deployment cold starts were not measured.
