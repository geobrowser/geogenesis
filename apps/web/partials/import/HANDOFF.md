# CSV Import — Relation Resolution Handoff

## Summary

CSV import now supports full RELATION resolution with a refactored import pipeline:

- RELATION cells are resolved to existing entities (exact match) or local entities are created.
- Multi-value relation cells are split (`','`, `';'`, `'|'`) and emitted as multiple relations.
- Types can come from either a constant selected type or a CSV types column.
- Re-generation only clears import-generated local changes (not all local edits in the space).
- Generation is protected against stale async runs (newer runs supersede older runs).
- Import code has been split into shared hooks/utilities for maintainability.

---

## What Changed

### Core behavior upgrades

1. RELATION import is now first-class in generation (`Relation` writes instead of raw `Value` strings).
2. Auto-create for missing relation entities includes:
   - `Name` value
   - `Types` relation from `relationValueTypes[0]` when available
3. Publish counts now include both values and relations (`actionsCountAtom`).
4. Upload/re-upload/delete flows reset mapping state safely and clear only generated import edits.

### Safety + correctness fixes

1. Added per-generation supersession tracking to avoid stale async writes.
2. Replaced broad `clearLocalChangesForSpace()` usage in import flow with scoped cleanup by IDs.
3. Added CSV parse error handling with user-facing error messaging.
4. Auto-map now applies deterministic batched updates and has per-column error isolation.

---

## Current File Map

### Existing files updated

| File | Purpose |
|------|---------|
| `use-import-generate.ts` | Orchestrates generation: clears prior generated import changes, resolves relations/types, builds rows, commits values/relations |
| `generate.tsx` | Upload + mapping UI; uses shared schema/session hooks; parse error handling; auto-map trigger lifecycle |
| `import-review.tsx` | Review UI; manual mapping re-triggers generation using shared session clear helper |
| `import-preview-table.tsx` | Preview table; uses shared relation split util and property mapping popover |
| `use-auto-map-columns.ts` | Auto-map unmapped columns with batched mapping/property updates and resilient error handling |
| `atoms.ts` | Import atoms; typed `stepAtom`; action counter now includes values + relations |
| `core/sync/store.ts` | Added `clearLocalChangesByIds({ spaceId, valueIds, relationIds })` |
| `core/sync/store.test.ts` | Coverage for scoped local-change cleanup |

### New files added

| File | Purpose |
|------|---------|
| `use-import-schema.ts` | Shared schema query hook for import flow (`selectedTypeId + spaceId`) |
| `use-import-session.ts` | Shared import session state helpers (`clearGeneratedChanges`, `resetMappedState`, `resetImportState`) |
| `relation-cell.ts` | Shared `splitRelationCell()` utility |
| `header-normalization.ts` | Shared header normalization + typo normalization map |
| `import-generation.ts` | Pure generation helpers (`collectRelationCells`, `buildGeneratedRows`, generation tracker) |
| `import-resolution.ts` | Async resolution helpers for relation entities + types column |
| `atoms.test.ts` | Ensures action count includes values + relations |
| `relation-cell.test.ts` | Coverage for multi-separator relation splitting |
| `header-normalization.test.ts` | Coverage for normalization + typo map |
| `import-generation.test.ts` | Coverage for generation tracker + relation cell pre-collection |
| `import-resolution.test.ts` | Coverage for relation/type resolution helpers |

---

## Generation Pipeline (Current)

**Entry point:** `useImportGenerate(spaceId)`

1. **Guard + start generation token**
   - Requires: type source (`selectedType` or `typesColumnIndex`), data rows, mapped name column.
   - Starts a generation token (`createGenerationTracker`).

2. **Clear prior generated import edits (scoped)**
   - `useImportSession.clearGeneratedChanges()`:
   - Calls `store.clearLocalChangesByIds(...)` with current generated `valuesAtom` + `relationsAtom` IDs.

3. **Collect RELATION cells**
   - `collectRelationCells(...)` scans mapped relation properties and pre-collects unique split cell parts.

4. **Resolve relation entities**
   - `resolveRelationEntities(...)`:
   - Exact match => use existing entity
   - No match => create local entity seed (Name + optional Types relation)
   - Multiple exact matches => mark ambiguous and skip

5. **Resolve per-row types (optional)**
   - `resolveTypesForRows(...)` resolves unique values from `typesColumnIndex`.
   - Exact match only; 0 or many matches are skipped.

6. **Build row-level values/relations**
   - `buildGeneratedRows(...)` creates:
   - Name values
   - Types relation per row (constant type or resolved type)
   - Property values or relations by dataType

7. **Commit if generation token is still current**
   - Writes to store (`setValue`, `setRelation`) and updates atoms (`valuesAtom`, `relationsAtom`).
   - Advances to `step5`.

---

## Notable Design Decisions

1. **Scoped import cleanup**
   - Import flow never clears unrelated local edits in the same space.

2. **Separation of concerns**
   - Async resolution is separated from pure generation transforms.
   - Shared hooks/utilities remove duplicate logic across generate/review/table.

3. **Deterministic automap writes**
   - Auto-map collects results first, then performs batched atom updates.

4. **Shared normalization and parsing**
   - Header normalization and relation splitting are centralized and test-covered.

---

## Remaining Known Gaps / Follow-ups

1. **Schema in types-column-only mode**
   - `useImportSchema` is keyed off `selectedTypeId`; if only `typesColumnIndex` is chosen, schema is empty.
   - Behavior currently relies on `extraProperties` / `store.getProperty()` fallback and works in practice.

2. **Auto-generate trigger UX**
   - `import-review.tsx` still relies on effect-driven auto-generate + `hasAutoGeneratedRef`.
   - Functional now, but could be made more explicit/state-machine-driven if needed.

---

## Test Coverage Added

- `core/sync/store.test.ts`:
  - `clearLocalChangesByIds` only removes matching local entries and emits hydrate/cleared events.
- `partials/import/atoms.test.ts`:
  - action count includes values + relations.
- `partials/import/relation-cell.test.ts`:
  - relation splitting behavior.
- `partials/import/header-normalization.test.ts`:
  - normalization + typo correction behavior.
- `partials/import/import-generation.test.ts`:
  - generation tracker supersession + relation pre-collection.
- `partials/import/import-resolution.test.ts`:
  - relation/type resolution exact-match behavior.

---

## Validation Commands

Run from `apps/web`:

```bash
bun eslint partials/import/*.ts partials/import/*.tsx core/sync/store.ts core/sync/store.test.ts
bun tsc --noEmit
bun vitest run core/sync/store.test.ts partials/import/atoms.test.ts partials/import/relation-cell.test.ts partials/import/header-normalization.test.ts partials/import/import-generation.test.ts partials/import/import-resolution.test.ts
```

All pass in the current branch state.
