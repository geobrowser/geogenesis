# CSV Import — Current Handoff

## Summary

Import generation is now split into clear stages with strict matching rules and explicit unresolved UI:

- Property linking is strict: no auto-create during automap.
- Row entity linking resolves exact `name + type`; no match creates a new row entity.
- Relation cell linking resolves exact matches only:
  - `0` exact matches => auto-create relation target entity
  - `1` exact match => link to existing
  - `>1` exact matches => unresolved and requires manual resolution
- CSV Types-column values that cannot resolve are flagged per-cell in review and can be manually resolved.
- Unresolved relation tokens are clickable in review and open find/create popover.
- Auto-created relation targets are materialized with a `Name` value (not just referenced by relation ID).
- Step 2 type-source changes clear generated actions to avoid stale publish state.

---

## Matching Rules Implemented

### 1) Property mapping (`use-auto-map-columns.ts`)

- Exact property-name match only.
- `0` matches => leave unmapped for review (`Needs mapping`).
- `>1` matches => leave unmapped for review.
- No property auto-create in automap.

### 2) Row entity resolution (`resolveRowsByNameAndType`)

- Resolve by exact row name and type.
- Uses `SPACE_RANK` priority (`core/utils/space/space-ranking.ts`) to pick the best existing match when multiple exist.
- If multiple candidates remain in top-ranked spaces, prefers most backlinks; final tie-break is deterministic by entity ID.
- `0` matches => create row entity ID for import row.
- Missing row name or unresolved row type => unresolved.

### 3) Relation target resolution (`resolveRelationEntities`)

- Per relation token in mapped relation columns:
  - query by token (and relation type constraints when present)
  - filter to exact name (and type when configured)
- Outcomes:
  - exact count `0` => `created`
  - exact count `1` => `found`
  - exact count `>1` => `ambiguous` (manual resolution required)

No ranking/backlink tie-break is used for relation-column tokens anymore.

---

## Unresolved UI + Manual Resolution

### Data model

- `unresolvedLinksAtom`: per-cell unresolved metadata keyed by `${rowIndex}:${csvColumnIndex}`.
- `relationOverridesAtom`: manual token override map keyed by `${propertyId}::${token}`.
- `typeOverridesAtom`: manual types-column override map keyed by raw CSV type value.

### Review table behavior (`import-preview-table.tsx`)

- Relation tokens that are unresolved render as warning chips.
- Clicking unresolved token opens `SelectEntityAsPopover` (find/create).
- Selection writes override and triggers regeneration.
- Types-column unresolved values render `Unresolved type` and are clickable for manual type resolution.
- Types source column is shown as `Types (from CSV)` and is mapping-locked (not treated as normal property mapping).
- Name cell shows `Unresolved entity` only for rows that still cannot be resolved/materialized.

---

## Generation Pipeline (Current)

Entry point: `useImportGenerate(spaceId)`

1. Clears prior generated values/relations in store via `clearLocalChangesByIds`.
2. Resolves relation tokens (`resolveRelationEntities`).
3. Merges manual relation overrides (`relationOverridesAtom`) onto resolved map.
4. Resolves per-row types (`resolveTypesForRows`) when types column is used.
5. Merges manual type overrides (`typeOverridesAtom`) into resolved types.
6. Resolves rows (`resolveRowsByNameAndType`).
6. Builds unresolved-cell metadata (`buildUnresolvedLinksByCell`).
7. Builds values/relations (`buildGeneratedRows`) and writes to store.

---

## Important Implementation Details

- `buildGeneratedRows` now writes `Name` values for auto-created relation targets (`status: 'created'`) so those entities exist with a usable name.
- Deduping prevents duplicate `Name` value writes for repeated created targets.
- `clearGeneratedChanges` clears generated values/relations + unresolved-cell state, while keeping manual overrides.
- Full import mapping reset clears both relation and type overrides.
- `use-import-generate.ts` no longer force-creates entities for all unresolved rows (removes prior over-broad fallback).
- Step 3 warning counts and auto-map logic exclude `typesColumnIndex`.
- Step 2 type-source changes call `clearGeneratedChanges()` before switching source.

---

## Relevant Files

- `apps/web/partials/import/use-import-generate.ts`
- `apps/web/partials/import/import-resolution.ts`
- `apps/web/partials/import/import-generation.ts`
- `apps/web/partials/import/import-review.tsx`
- `apps/web/partials/import/import-preview-table.tsx`
- `apps/web/partials/import/use-import-session.ts`
- `apps/web/partials/import/use-auto-map-columns.ts`
- `apps/web/partials/import/atoms.ts`
- `apps/web/partials/import/generate.tsx`

Tests:

- `apps/web/partials/import/import-resolution.test.ts`
- `apps/web/partials/import/import-generation.test.ts`

---

## Notes

- In this environment, `apps/web/node_modules` is missing, so local lint/tsc/vitest execution was not possible here.
- Behavior has been adjusted based on manual QA reports in this branch; this document reflects the current expected behavior.
