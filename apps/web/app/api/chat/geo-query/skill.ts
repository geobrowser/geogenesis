// Ported verbatim from the geo-query skill, v0.2.7.
//
// Source: content-management/skills/non-actionable/geo-query/SKILL.md
//
// Kept as one string rather than a distilled summary on purpose: the value is
// in the specifics — the pagination caps, the filter syntax, and the 15 gotchas,
// each of which is a real recurring mistake. Trimming it means choosing which
// silent-wrong-answer to reintroduce. Gotcha 15 and the "Memory blow-up"
// section are not style advice: that query shape OOM-killed five API pods, and
// this sub-agent writes against the same API.
//
// When the content team ships a new version, replace the body below and bump
// GEO_QUERY_SKILL_VERSION. Sections that referenced the content-management repo
// (its canonical client, curl fallback, and sibling-file pointers) are removed —
// this runtime has runQuery instead and cannot read that repo.
export const GEO_QUERY_SKILL_VERSION = '0.2.7';

export const GEO_QUERY_SKILL = `

# Geo Knowledge Graph — Querying

Query and explore entities, types, properties, and relations in the Geo knowledge graph via its GraphQL API.

## When to apply

Use this skill when the user wants to:

- Look up an entity by ID.
- Search for entities of a given type (optionally scoped to a space).
- Explore what properties and relations an entity has.
- Discover the schema for an unfamiliar entity type before publishing.
- Find type, property, or relation type IDs.
- **Review / fact-check a submission** — a \`geobrowser.io/.../<entity>\` page made of data-block tables (see "Review a submission" below).

**How you run queries here.** Call the \`runQuery\` tool. It handles the endpoint, transport, and retries; you supply the GraphQL document and any variables. It returns \`data\` on success, or the full error text so you can correct the query and try again.

## API basics

- **Endpoint:** handled by \`runQuery\` — it targets whichever network this app is configured for. Never hardcode an endpoint, and do not assume testnet.
- **Auth:** none required for reads.
- **UUIDs:** 32-char hex, no dashes (e.g. \`7ed45f2bc48b419e8e4664d5ff680b0d\`).
- **Browser links:** \`https://www.geobrowser.io/space/{spaceId}/{entityId}\`.

> Why GraphQL and not MCP: MCP (\`hypergraph-mcp\`) is convenient for casual browsing, but it can be slow and occasionally returns wrong schema data (e.g. inflated property lists). For anything that informs a write, or anything that must be exact, use the GraphQL queries below — they're deterministic.

## Core concepts (compact)

- **Entity:** a unique node in the graph (person, place, article, etc.). Has an ID, \`name\`, \`description\`, \`types\`, \`values\`, and \`relations\`.
- **Property:** a typed attribute on an entity (\`text\`, \`date\`, \`boolean\`, \`decimal\`, \`integer\`, \`float\`, \`url\`).
- **Relation:** a typed edge between two entities. Relations are themselves entities — they can have their own properties.
- **Type:** a category (\`Person\`, \`Article\`, …). Types define a schema of default properties that every entity of that type inherits.
- **Space:** an independent community/topic scope. An entity can live in multiple spaces; each has its own perspective.

These five concepts are the whole model — there is no further reading available from here.

## List query: \`entities\` vs \`entitiesConnection\`

There are two list queries with the same top-level args (\`typeId\`, \`spaceId\`, \`typeIds\`, \`spaceIds\`, \`filter\`, \`first\`, \`offset\`, \`orderBy\`) but different shapes. **Choose based on result set size**:

|              | \`entities\`                                        | \`entitiesConnection\`                        |
| ------------ | ------------------------------------------------- | ------------------------------------------- |
| Return shape | flat array                                        | \`{ nodes, edges, pageInfo, totalCount }\`    |
| Pagination   | \`first\` + \`offset\` **(both ≤ 1000)**              | cursor \`after\`/\`before\` (\`first\`/\`offset\` ≤ 1000 here too) |
| Use when     | small, bounded lookups; default for <1000 results | totalCount needed, or unbounded result sets |

**CRITICAL — pagination caps:** \`first\` and \`offset\` are BOTH hard-capped at 1000 (400 \`Pagination argument "offset"/"first" cannot exceed 1000\`) — on flat lists (\`entities\`, \`relations\`, \`values\`) **and on \`*Connection\` queries alike**. Past row 1000 the only way forward is **cursor** pagination (\`after\`) on a \`*Connection\`; switching to a Connection but keeping \`offset\` hits the same wall. \`first: 1000\` is the hard **ceiling, not a default** — a large root page that *also* nests per-node \`relations\` is the shape that OOM-kills the API (see "Memory blow-up" under Performance); when you nest relations/values per node, keep the **root page ≤ 100** and **filter nested relations by \`typeId\`**. Count-only? \`first: 0\` + \`totalCount\` works and is the cheapest query there is.

**CRITICAL — response shape:** \`entities\` returns a **flat array**. Do NOT wrap fields in \`{ nodes { ... } }\`.

\`\`\`graphql
# CORRECT
{ entities(typeId: "TYPE_ID", first: 50) { id name description } }

# WRONG — \`entities\` is flat, no \`nodes\`
{ entities(typeId: "TYPE_ID", first: 50) { nodes { id name } } }

# Valid but discouraged — this works, yet prefer the canonical top-level \`typeId\` arg above
{ entities(filter: { typeIds: { anyEqualTo: "TYPE_ID" } }, first: 50) { id name } }
\`\`\`

## Core queries

### Look up a single entity

This is the starting point for almost every investigation:

\`\`\`graphql
{
  entity(id: "ENTITY_ID") {
    id
    name
    description
    spaceIds
    types {
      id
      name
    }
    values(first: 100) {
      nodes {
        property {
          id
          name
        }
        text
        date
        boolean
        decimal
        integer
        float
      }
    }
    relations(first: 100) {
      nodes {
        id # relation edge ID (use this to delete the relation)
        entityId # relation ENTITY ID (use this to read/update relation properties)
        type {
          id
          name
        }
        toEntity {
          id
          name
        }
      }
    }
  }
}
\`\`\`

Values come back as typed fields (\`text\`, \`date\`, \`boolean\`, \`decimal\`, \`integer\`, \`float\`; \`datetime\`, \`time\`, \`point\`, \`language\`, \`unit\` also exist) — NOT a single \`value\` field. Check each for non-null. There is no \`url\` column — URL values live in \`text\`.

**\`entity(id:)\` NEVER returns \`null\`.** Any well-formed ID — nonexistent, or a relation *edge* id — returns a stub: \`name: null\`, \`spaceIds: []\`, \`typeIds: []\`, zero values/relations/backlinks (and a junk \`createdAt\`). To check whether an entity actually exists, test \`spaceIds\`/\`types\` non-empty — never null-test the response.

### Relation properties — read them inline

Relations are entities: their own properties (a Blocks relation's view preference, its \`position\`, …) hang off the relation's \`entityId\`. The \`entity {}\` field on each relation node reads them in the SAME query — never loop a second lookup per relation:

\`\`\`graphql
{
  entity(id: "PAGE_ID") {
    relations(first: 20, filter: { typeId: { is: "REL_TYPE_ID" } }, orderBy: POSITION_ASC) {
      totalCount # nested relations/values expose totalCount + pageInfo too
      nodes {
        id       # edge id (delete handle)
        entityId # relation-as-entity id (property handle)
        position
        entity { # ← the relation-as-entity, inline
          valuesList(first: 10) { property { id name } text }
          relationsList(first: 10) { type { name } toEntity { id name } }
        }
      }
    }
  }
}
\`\`\`

Verified live:

- Nested \`relations\`/\`values\` accept \`filter\` and \`orderBy\` (e.g. \`POSITION_ASC\`) — narrow and sort server-side.
- A Blocks relation typically carries its view preference as a **relation** on the relation-entity (\`View → "Bullet list view"\`), not a value.
- Two-step still works when you already hold an \`entityId\`: \`entity(id: "<entityId>")\`.
- One relation by edge id: \`{ relation(id: "EDGE_ID") { id entityId position typeId fromEntityId toEntityId } }\` — takes the EDGE id only (\`entityId\` there returns null).
- \`relationsList\` / \`valuesList\` are flat variants of the nested connections when you don't need paging.

### Multi-space entities — repeated types are NOT (necessarily) duplicates

\`entity.types\` aggregates the Types edges from **every space the entity lives in** — a multi-space entity repeats the same type once per space. That's healthy, not a duplicate. **Verdict rule — group the edges by \`spaceId\`:** different spaces = multi-space assertion, leave it (deleting another space's edge from outside it is a silent no-op anyway); same type twice in the *same* space = a **true duplicate**, flag it and fix it in that space. Report editor-facing as *"lives in N spaces (one Types edge per space — normal)"* and reserve **duplicate** for same-space repeats. Same grouping applies to any repeated relation.

\`\`\`graphql
{ entity(id: "ENTITY_ID") { name
    relations(filter: { typeId: { is: "8f151ba4de204e3c9cb499ddf96f48f1" } }, first: 20) {
      nodes { spaceId toEntity { id name } } } } }   # 8f151ba4… = Types property
\`\`\`

Verified live (Bitcoin \`2f8238b2…\`): 6 Topic edges = three spaces with one each (healthy) + one space with **three** (true duplicate — name that space, 2 edges to remove). The naive "Topic appears 6×, duplicates!" reading is wrong in both directions.

### Search entities by type (optionally by space)

\`\`\`graphql
# Small result set
{
  entities(typeId: "TYPE_ID", spaceId: "SPACE_ID", first: 50) {
    id
    name
    description
  }
}

# Large/unbounded — use cursor pagination
{
  entitiesConnection(typeId: "TYPE_ID", spaceId: "SPACE_ID", first: 500) {
    totalCount
    nodes {
      id
      name
      description
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
\`\`\`

### Cursor pagination

Feed \`pageInfo.endCursor\` back as \`after:\` until \`hasNextPage\` is false — \`entitiesConnection(…, first: 500, after: "<endCursor>") { nodes {…} pageInfo { hasNextPage endCursor } }\`. Each page is its own \`runQuery\` call.

## Performance — think in filters, not loops (fixes the "5–10 minute query")

**The #1 slowness cause is N+1 querying: paging a list, then fetching each row's relations one by one.** Each round trip is ~150–500ms; with the LLM reading every response, a 1,000-row scan becomes minutes-to-tens-of-minutes. The API itself is fast — push the work into ONE server-side filter. Measured on the live API (1,088 News stories, World affairs):

| Task: "News stories about the Iran War topic" | Time |
|---|---|
| ❌ N+1: page all stories, fetch each story's relations, filter client-side | **~131s** of pure API time (25 stories ≈ 3s, ×1088) — plus LLM overhead per call → the observed 5–10 min |
| ✅ One filtered query (below) | **469ms**, complete (238 stories) |

### ⚠ Memory blow-up — never pair a big root page with unfiltered nested relations

N+1 is slow; the over-correction is *dangerous*. Inlining nested fields to kill N+1 (good) becomes an **API-killer** when a large root page *also* pulls every relation per node:

\`\`\`graphql
# ❌ OOM shape — MULTIPLICATIVE: ~1000 nodes × ~1000 relations each, hydrated in one response
{ entitiesConnection(typeId:"…", first: 1000) { nodes {
    id name relations(first: 1000) { nodes { type{ name } toEntity{ name } } } } } }
\`\`\`

One request of this shape hydrates enough to blow the API pod's memory ceiling (real incident: 28 such requests → 5 pod OOM-kills; it also takes ~33 s, past the 30 s client timeout, so it never even succeeds — it just burns retries and a pod restart). Two **independent** knobs fix it:

- **Root page ≤ 100** whenever you nest per-node relations — not \`first: 1000\`. More cursor pages, each cheap and inside the timeout.
- **Filter the nested relations by \`typeId\`** — \`relations(filter: { typeId: { is: "…" } }, first: N)\` hydrates ~1 relation per node instead of ~1000. This is the real fix, and it also reaches topics with >1000 relations an unfiltered page can't.

The flat **\`relationsConnection\` bulk scan** (below) stays safe — it's a *flat* 1,000-row relation scan with bounded nested data, not \`nodes × relations\`. Page size alone isn't the danger; **root-page × nested-relations** is.

### "Entities related to X" — the three fast patterns

\`\`\`graphql
# Pattern 1 — entities that have a relation TO a given entity (topic, person, …):
{ entitiesConnection(
    typeId: "NEWS_STORY_TYPE", spaceId: "SPACE_ID",
    filter: { relations: { some: { spaceId: { is: "SPACE_ID" }, toEntityId: { is: "TOPIC_ID" } } } },
    first: 500) {
    totalCount nodes { id name } pageInfo { hasNextPage endCursor } } }

# Pattern 2 — backlinks: all relations pointing AT an entity (then read fromEntity inline):
{ relations(filter: { toEntityId: { is: "TOPIC_ID" }, spaceId: { is: "SPACE_ID" } }, first: 500) {
    id typeId fromEntity { id name types { id name } } } }

# Pattern 3 — entity-centric: the same incoming edges via the backlinks field (+ free totalCount):
{ entity(id: "TOPIC_ID") { backlinks(first: 500, filter: { spaceId: { is: "SPACE_ID" } }) {
    totalCount nodes { id typeId type { name } fromEntity { id name types { id name } } } } } }
\`\`\`

(Patterns 2 and 3 return the same edges — verified: identical counts on live data. Pick 2 for flat bulk reads, 3 when you're already entity-centric or want \`totalCount\`.)

### Bulk scans (audits/cleanup) — inline nested fields, never follow-up per row

\`relationsConnection\` pages 1,000 rows in ~330ms **with nested fields inlined** — e.g. auditing relations' entity data (the "find relations missing their relation-entity" hunt) is one paged query, not one query per relation:

\`\`\`graphql
{ relationsConnection(filter: { spaceId: { is: "SPACE_ID" } }, first: 1000) {
    totalCount
    nodes { id entityId typeId entity { id name } fromEntity { name } toEntity { name } }
    pageInfo { hasNextPage endCursor } } }
\`\`\`

A 150k-relation space ≈ 150 pages ≈ under a minute of API time — vs. hours as N+1.

### Exclusion filters (\`none\`) are the one slow server path — ALWAYS scope them

"Find entities **missing** X" (\`values:{ none: … }\` / \`relations:{ none: … }\`) is the only pattern that is genuinely slow **server-side**. Measured: unscoped over all Persons **26.3s**; the same query scoped with \`spaceId\` **1.4s** (19× faster); the bulk-page alternative (page 1000 rows with the field inlined, check client-side) **0.7s/page** and fully predictable. So for any missing-data hunt: **scope by \`spaceId\` (and \`typeId\`)**, or bulk-page and check client-side. If an audit is still slow after scoping, that's the case to memo the core team — attach the query and the timing.

**Rules of thumb:**
- Ask "can the server filter this?" first — \`relations: { some: … }\`, \`values: { some/none: … }\`, \`toEntityId\`, \`typeIds\` cover most cases.
- Pull nested data (\`fromEntity\`, \`toEntity\`, \`entity\`, \`types\`) **inline in the same query** instead of a second lookup.
- Loop over pages (500–1000 rows each), never over rows.
- If a complex filter 500s, scope it by \`spaceId\` and drop \`first\` to 100–50 — still one query per page, not per row.
- Genuinely slow AFTER these patterns (a single filtered page >5s)? Then it may be an API-side limit — capture query + timing and escalate to the core team.

## Data freshness — no cache, only indexer lag (verified)

Editors asked whether queries return stale/cached data after publishing. **Measured: the API serves no cached responses** (no \`cache-control\`/CDN headers; identical repeat reads), and a publish appeared in the index **~7 seconds** after the edit landed. What you read is the latest **indexed** state; the only delay is blockchain→indexer lag (seconds, occasionally ~a minute under load).

- Just published and don't see it? **Wait ~30s and re-query** — it's indexer lag, not a cache; there is no cache to bust.
- To confirm the indexer has caught up to your edit:
  \`\`\`graphql
  { editVersionsConnection(first: 1, orderBy: CREATED_AT_DESC) { edges { node { name createdAt } } } }
  \`\`\`
  When your edit's name shows up there, every query reflects it.

## "Published" is two different timestamps — pick the right one

A **News story** carries **two** times, and they answer different questions. Confusing them silently returns the wrong count.

| Field | What it records | Use it for |
| --- | --- | --- |
| **\`Publish datetime\`** property (\`94e43fe8faf241009eb887ab4f999723\`, a \`date\` value) | when the **source outlet** originally published the article — the real-world dateline | "when did the news happen", ordering stories by article date |
| entity **\`createdAt\`** | when the story was **added to Geo** (indexed into the space) | **"published/added recently", "new stories in the last N hours", freshness monitoring** |

When an editor asks *"how many news stories were **published** in {space} in the last N hours"*, they almost always mean **added to Geo** → filter on **\`createdAt\`**, **not** the \`Publish datetime\` property. The ingestion pipeline bulk-adds stories hours after their source dateline, so the two routinely differ by many hours — an article with an Aug-11 dateline can enter Geo on Aug-12. If the intent is genuinely ambiguous, report both or ask which one they mean.

Count News stories added to a space within a window (per space):

\`\`\`graphql
{
  entitiesConnection(
    typeId: "e550fe517e904b2c8fffdf13408f5634"   # News story
    spaceId: "<SPACE_ID>"
    filter: { createdAt: { greaterThanOrEqualTo: "2026-08-12T01:25:00Z" } }
    first: 0                                       # totalCount only — cheap
  ) { totalCount }
}
\`\`\`

> ⚠ **Migration caveat.** On the current endpoint, entity \`createdAt\` for entities that existed **before** the 2026-08 infra migration was flattened to the migration date. For "recent / new" questions this is harmless (those stories are post-migration and carry real \`createdAt\`), but for a window that **crosses the migration boundary**, \`createdAt\` undercounts — use the story's earliest \`editVersion\` createdAt instead.

## Filtering

The \`filter\` arg accepts \`EntityFilter\` for field-level conditions:

\`\`\`graphql
{
  entities(typeId: "TYPE_ID", filter: { name: { startsWithInsensitive: "Bitcoin" } }, first: 20) {
    id
    name
  }
}
\`\`\`

Common \`EntityFilter\` fields:

- \`id\` — \`UUIDFilter\` (uses \`is\` / \`isNot\` / \`in\`; NOT \`equalTo\`).
- \`name\`, \`description\`, \`createdAt\`, \`updatedAt\` — \`StringFilter\` (\`startsWithInsensitive\`, \`includesInsensitive\`; exact match is \`is\` / \`isInsensitive\` — there is **no \`equalTo\`**; \`greaterThan\`/\`lessThan\` work for keyset paging on \`createdAt\`).
- \`spaceIds\`, \`typeIds\` — \`UUIDListFilter\` (\`anyEqualTo\`).
- \`relations\`, \`backlinks\` — \`EntityToManyRelationFilter\` (\`some\`, \`none\`, \`every\`).
- \`values\` — \`EntityToManyValueFilter\`.
- \`relationsExist\` / \`backlinksExist\` / \`valuesExist\` — cheap booleans for "has any at all" (e.g. orphan hunts: \`{ relationsExist: false }\`) without the \`none\` machinery. Still scope them — measured 1.6s scoped, ~6.6s unscoped-ish cases.
- \`and\`, \`or\`, \`not\`.

**Scope relation filters by space.** Unscoped cross-space filters are the slow path (measured: a \`none\` exclusion 26 s unscoped vs 0.3 s scoped); historically (≤2026-06) they could also return \`INTERNAL_SERVER_ERROR\` — not reproduced on the current API (2026-07), but keep scoping as the default. Include \`spaceId\` inside relation filters:

\`\`\`graphql
relations: { some: { spaceId: { is: "SPACE_ID" }, toEntity: { ... } } }
\`\`\`

**Prefer \`none\` over \`every\` for exclusion.** \`every\` means "all items must match the full condition" and misbehaves when items have different field values. Use \`none\` for "there is no X where Y":

\`\`\`graphql
# "entity has no name value"
values: { none: { propertyId: { is: NAME_PROP_ID }, text: { isNull: false } } }
\`\`\`

If complex filters return 500s, reduce \`first\` from 500 → 100 → 50.

## Schema discovery workflow

When you need to publish or understand an entity type you haven't seen before, **inspect an existing entity of that type** to learn the schema. Do this before assuming any property/relation IDs.

1. Find entities of the type (search by \`typeId\`).
2. Pick one and fetch it fully (all values + relations).
3. Read the property names and relation types from the result.
4. Note the IDs — property IDs, relation type IDs, and \`toEntity\` IDs for classification values.

\`\`\`graphql
{
  entities(typeId: "7ed45f2bc48b419e8e4664d5ff680b0d", first: 3) {
    id
    name
    types {
      id
      name
    }
    values(first: 50) {
      nodes {
        property {
          id
          name
        }
        text
        date
      }
    }
    relations(first: 50) {
      nodes {
        type {
          id
          name
        }
        toEntity {
          id
          name
        }
      }
    }
  }
}
\`\`\`

This is the query \`geo-publish\` relies on before any write — paste the discovered IDs to it as \`KNOWN IDs\` so it doesn't re-discover.

## Review a submission (multi-table page)

Use this when the user gives a \`geobrowser.io/space/<SPACE_ID>/<ENTITY_ID>\` URL or asks to "review / fact-check this submission/page". A submission is a single entity whose page contains one or more **data blocks** — each block is a filtered query rendered as a table. Reviewing means: enumerate ALL blocks, paginate ALL rows in each, and inspect entities for the issues the user named (missing entries, wrong descriptions, inaccurate properties).

1. **Parse the URL** → \`…/space/<SPACE_ID>/<ENTITY_ID>\`. The second hex segment is the entity id.
2. **Fetch the submission entity** (single-entity query above), asking for \`position\` on each relation. In its \`relations\`, find entries whose \`type.name\` is \`Blocks\` / \`Data block\` / \`Has block\` / similar — each \`toEntity.id\` is a block. If the relation type isn't obvious, inspect each \`toEntity\` until you find the ones whose own type is \`Data block\`. Don't guess — schemas drift; confirm by inspection.
   **Block order = the \`position\` field on the Blocks relation** (fractional-index strings like \`a02U4\` < \`a0ker\` < \`a1AeO\`, lexicographic). Let the server narrow AND order — nested \`relations\` accept \`filter\` + \`orderBy\`:
   \`\`\`graphql
   { entity(id: "PAGE_ID") { relations(filter: { typeId: { is: "beaba5cba67741a8b35377030613fc70" } }, orderBy: POSITION_ASC, first: 100) { nodes { id entityId position toEntity { id name } } } } }
   \`\`\`
   Verified against the live UI: \`POSITION_ASC\` order reproduces the page's table order exactly. Report blocks in that order — natural response order is NOT sorted (verified live).
3. **Decode each block's config — and its KIND** (\`Data source type\` relation). A **query block**
   stores its query as a \`Filter\` **value** and its row order as a \`Sort\` **value** —
   \`{"sort_by":"<property-id>","sort_direction":…}\` (verified live: a timeline block = Publish date,
   descending). A **collection block** instead holds its rows as \`Collection item\` relations.
4. **Re-run each filter, paginate FULLY, keep the block's OWN row order** — query block: \`entities(...)\`
   with \`orderBy\` per its \`Sort\` value, paginating on the sort property (\`greaterThan\`/\`lessThan\`);
   collection block: its \`Collection item\` relations with \`orderBy: POSITION_ASC\` (null positions last).
   Offset caps at 1,000; don't stop at page 1. **Never substitute \`createdAt\` for the block's own
   ordering** — that is exactly what shuffles tables vs the UI.
5. **Inspect each row** per the review criteria — missing entries (cross-ref the expected list / domain knowledge), wrong descriptions (read the Description \`text\`), inaccurate properties (spot-check against the entity's Web URL).
6. **Report once, structured** — per block: name + id, total rows (after full pagination), and per-issue flags \`[OK]\` / \`[MISSING]\` / \`[WRONG DESCRIPTION]\` / \`[INACCURATE PROPERTY]\`, plus a summary line (e.g. "Block 'Hospitals — California': 247 rows, 12 issues (3 missing, 7 wrong descriptions, 2 inaccurate prices)"). The reviewer needs the full picture before approve / send-back / partial-approve.

### Front pages and tabs

To reproduce a whole space page ("recreate the tables on every tab of the AI space"): front page =
\`{ space(id: "SPACE_ID") { page { id name } } }\`; order its \`Tabs\` relations by position, same as blocks (verified live: the AI front page's 10 tabs match the rendered order; Tabs type id from \`type { id name }\`):

\`\`\`graphql
{ entity(id: "PAGE_ID") { relations(filter: { typeId: { is: "TABS_REL_TYPE_ID" } }, orderBy: POSITION_ASC, first: 50) { nodes { position toEntity { id name } } } } }
\`\`\`

Each tab is itself a page — enumerate its blocks by \`position\`, rows per each block's \`Sort\` value / \`Collection item\` positions.

## Finding type and property IDs by name

\`Type\` and \`Property\` are themselves types — you can query all of them:

\`\`\`graphql
# All type definitions
{
  entities(
    typeId: "e7d737c536764c609fa16aa64a8c90ad"
    filter: { name: { includesInsensitive: "article" } }
    first: 20
  ) {
    id
    name
  }
}

# All property definitions
{
  entities(
    typeId: "808a04ceb21c4d888ad12e240613e5ca"
    filter: { name: { includesInsensitive: "date" } }
    first: 20
  ) {
    id
    name
  }
}
\`\`\`

For relation types, inspect an entity that uses them — the \`type { id name }\` field on a relation gives you the ID.

Direct lookup once you hold a property ID (note the field names — \`dataTypeName\`, not \`dataType\`):

\`\`\`graphql
{ property(id: "PROP_ID") { id name dataTypeName renderableTypeName } }
\`\`\`

A relation's \`type {}\` returns this same \`PropertyInfo\` shape (\`id\`, \`name\`, \`dataTypeId/Name\`, \`renderableTypeId/Name\`, \`format\`, \`isType\`) — the type-as-entity is \`typeEntity {}\`.

### Fuzzy lookup when exact filters miss — \`search()\`

Semantic name search finds variants a string filter can't ("Iran war" also surfaces "War in Iran", "US-Iran war"):

\`\`\`graphql
{ search(query: "Iran war", spaceId: "SPACE_ID", first: 5) { id name } }
\`\`\`

~5–6 s per call — a discovery tool, not a bulk primitive. (\`searchConnection\` variant exists; optional \`similarityThreshold: Float\`.)

## Well-known IDs

Prefer the SDK's exported constants where possible:

\`\`\`typescript
import { SystemIds, ContentIds } from "@geoprotocol/geo-sdk";

(SystemIds.PERSON_TYPE, SystemIds.COMPANY_TYPE, SystemIds.PROJECT_TYPE, SystemIds.EVENT_TYPE);
(ContentIds.ARTICLE_TYPE, ContentIds.TALK_TYPE, ContentIds.PODCAST_TYPE, ContentIds.TOPIC_TYPE);
\`\`\`

Common raw IDs (verified against the API — for GraphQL queries):

| Name            | ID                                 |
| --------------- | ---------------------------------- |
| Type (meta)     | \`e7d737c536764c609fa16aa64a8c90ad\` |
| Property (meta) | \`808a04ceb21c4d888ad12e240613e5ca\` |
| Person          | \`7ed45f2bc48b419e8e4664d5ff680b0d\` |
| Article         | \`a2a5ed0cacef46b1835de457956ce915\` |
| Topic           | \`5ef5a5860f274d8e8f6c59ae5b3e89e2\` |
| News story      | \`e550fe517e904b2c8fffdf13408f5634\` |
| Publish datetime (prop) | \`94e43fe8faf241009eb887ab4f999723\` |
| Blocks (rel)    | \`beaba5cba67741a8b35377030613fc70\` |

A curated set of these is injected below, resolved from the SDK at build time — prefer those, since they cannot drift from what the rest of the app uses.

### Fields that DON'T exist (recurring mistakes)

Every row below is a real, recurring schema error (verified against live introspection, 2026-07):

| You wrote | What happens | Write instead |
|---|---|---|
| \`{ nodes { … } }\` on \`entities\` / \`relations\` / \`values\` / \`proposals\` | \`Cannot query field "nodes"\` — top-level flat lists return arrays | Select fields directly; want \`nodes\`/\`totalCount\`/\`pageInfo\`? use \`entitiesConnection\` etc. (Nested \`entity.values\` / \`entity.relations\` ARE connections and DO take \`nodes\`.) |
| \`spaceId\` as an **Entity field** | \`Cannot query field "spaceId" on type "Entity"\` | Field is \`spaceIds\` (plural array). \`spaceId\` exists only as a top-level query ARG (\`entities(spaceId: …)\`). |
| \`type\` in a **RelationFilter** | \`… "type" is not defined by type "RelationFilter"\` | \`typeId: { is: "REL_TYPE_ID" }\` (UUIDFilter); to filter on the type-as-entity use \`typeEntity: { … }\` (EntityFilter). |
| \`backlinks(spaceId: "…")\` | \`Unknown argument "spaceId"\` — backlinks has no spaceId arg | \`backlinks(filter: { spaceId: { is: "SPACE_ID" } })\` |
| Bare value/array in a filter: \`filter: { typeId: "X" }\`, \`{ id: [a, b] }\` | type mismatch — filter fields take filter OBJECTS | \`id: { is: "X" }\` · \`id: { in: ["a", "b"] }\` · \`typeIds: { anyEqualTo: "X" }\` |
| \`equalTo\` in any filter | \`… "equalTo" is not defined …\` — it doesn't exist anywhere | UUIDFilter: \`is\` / \`isNot\` / \`in\` · StringFilter exact: \`is\` / \`isInsensitive\` · UUIDListFilter: \`anyEqualTo\` |

## Critical gotchas — quick reference

1. **\`first\`/\`offset\` both cap at 1000** — flat AND \`*Connection\` queries; past row 1000, cursor (\`after\`) is the only way. \`first: 0\` → cheap \`totalCount\`-only.
2. **\`entities\` is flat**, not \`{ nodes { ... } }\`.
3. **Prefer top-level \`typeId\`/\`spaceId\` args** — \`filter: { typeIds: { anyEqualTo } }\` also works, but top-level is the canonical form.
4. **Scope relation filters by \`spaceId\`** — unscoped is the slow path (26 s vs 0.3 s measured; historically could 500).
5. **No \`equalTo\` anywhere:** \`UUIDFilter\` uses \`is\` / \`isNot\` / \`in\`; \`StringFilter\` exact match is \`is\` / \`isInsensitive\`; \`UUIDListFilter\` uses \`anyEqualTo\`.
6. **Prefer \`none\` over \`every\`** for exclusion logic.
7. **Values come back as typed fields** (\`text\`, \`date\`, \`boolean\`, …), not a single \`value\`.
8. **Relation \`id\` ≠ \`entityId\`** — \`id\` is the edge (for deletion); \`entityId\` is the relation-as-entity (for relation properties).
9. **Never N+1.** One server-side filter beats a per-row loop by ~300× (469ms vs 131s measured) — see the Performance section before writing any loop.
10. **No cache — only indexer lag.** Reads are always the latest indexed state; a fresh publish appears in seconds. Don't add cache-busting; just re-query after ~30s.
11. **Page/table order = relation \`position\`** (lexicographic sort / \`orderBy: POSITION_ASC\`), not response order. **Rows INSIDE a table are different:** query-block rows follow the block's \`Sort\` value (sort_by property + direction); collection-block rows follow \`Collection item\` positions — never \`createdAt\`.
12. **\`entity(id:)\` never nulls** — nonexistent IDs return an empty stub; test existence via \`spaceIds\`/\`types\`, never by null-check.
13. **Repeated entries in \`types\` ≠ duplicate types.** Multi-space entities carry one Types edge per space — group by relation \`spaceId\`; only same-space repeats are real duplicates (see "Multi-space entities").
14. **"Published" = entity \`createdAt\` (added to Geo), NOT the \`Publish datetime\` property (source dateline).** For "how many published in the last N hours" questions, filter entity \`createdAt\`; the \`Publish datetime\` property is the outlet's original dateline and runs hours earlier — mixing them up answered "0" when the true count was 13. See "'Published' is two different timestamps."
15. **Never pair a big root page with unfiltered nested relations.** \`entitiesConnection(first: 1000){ nodes { relations(first: 1000) } }\` is multiplicative and OOM-kills the API (real incident: 5 pod restarts). When nesting per-node relations, keep the **root page ≤ 100** and **filter nested relations by \`typeId\`**. \`first: 1000\` is a hard cap, not a default. See "Memory blow-up".

## Out of scope here

Writing to the graph. This runtime is read-only — if the answer needs a change made, say what would need to change and stop.
`;
