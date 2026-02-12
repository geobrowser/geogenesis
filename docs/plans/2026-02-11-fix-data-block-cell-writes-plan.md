---
title: 'fix: Reconnect data block cell writes across all view types'
type: fix
date: 2026-02-11
---

# fix: Reconnect data block cell writes across all view types

Cell editing in data block tables stopped working in the `stream: v2` commit (c640ae52, Dec 16 2025). All `storage.*` calls in `editable-entity-table-cell.tsx` and `table-block-property-field.tsx` were replaced with commented-out stubs referencing a `renderable` variable that doesn't exist in scope. Every non-name cell write (text, number, checkbox, date values, and relation add/delete) became a no-op.

Name editing still works because it goes through a separate code path that constructs the full `EVENT` payload inline.

## Scope

Four view types use `onChangeEntry`. Each has its own cell component:

| View          | Name cell                            | Property cell                                                                 | Status                                                     |
| ------------- | ------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| TABLE         | `editable-entity-table-cell.tsx`     | `editable-entity-table-cell.tsx` (ValueGroup, RelationsGroup)                 | **Broken** (values + relations)                            |
| LIST          | `table-block-list-item.tsx`          | `table-block-property-field.tsx` (EditableValueGroup, EditableRelationsGroup) | Values **broken**, relations **work** (direct `storage.*`) |
| GALLERY       | `table-block-gallery-item.tsx`       | `table-block-property-field.tsx` (same as LIST)                               | Same as LIST                                               |
| BULLETED_LIST | `table-block-bulleted-list-item.tsx` | N/A (name only)                                                               | Name **works**                                             |

## Design

Replace the nested `EVENT` → `UPSERT_RENDERABLE_TRIPLE_VALUE` → `renderable` payload structure with a flat, well-typed action union. The `onChangeEntry` function in `table-block.tsx` handles placeholder-aware writes (name edits, FOC, entity creation). Property cell writes on existing entities go through direct `storage.*` calls since they never involve placeholders.

See `docs/brainstorms/2026-02-11-data-block-cell-writes-brainstorm.md` for the full design rationale.

### Design decisions

1. **`onLinkEntry`** — Keep as a separate callback. It only updates `toSpaceId`/`verified` on an existing relation. Nothing to do with placeholder lifecycle.

2. **Dual write path** — `onChangeEntry` is not a generic "write" function. It's a **placeholder-aware write orchestrator**. Property cells (values + relations) only render for non-placeholder rows, so they write directly via `storage.*`. Name cells go through `onChangeEntry` because they're the entry point for placeholder commitment. This boundary is documented in `change-entry.ts`.

3. **TABLE view `RelationsGroup`** — Wire to direct `storage.*` calls (same pattern as the working `EditableRelationsGroup` in `table-block-property-field.tsx`). Keep the existing `useRelations` selector (no `spaceId` filter — intentionally shows data from all spaces), which differs from `EditableRelationsGroup`'s selector (filters by `spaceId`). Include `onCreateEntity` handler matching the `EditableRelationsGroup` pattern.

4. **`EditableRelationsGroup` in `table-block-property-field.tsx`** — Already works. No changes.

5. **Shared `writeValue` helper** — Extract a `writeValue(storage, entityId, spaceId, property, value, existingValue)` function used by both `onChangeEntry`'s `SET_VALUE` case and `ValueGroup`/`EditableValueGroup`. Eliminates duplicated value-construction logic across the two write paths.

## Implementation

### Phase 1: New Action type, `writeValue` helper, and `onChangeEntry` signature

**File: `apps/web/partials/blocks/table/change-entry.ts`**

Replace the existing types with:

```typescript
import { Property, Value } from '~/core/types'
import { Mutator } from '~/core/sync/use-mutate'

// Actions that flow through onChangeEntry — all of these can be the first
// interaction with a placeholder row, triggering entity creation.
//
// Property cells on existing entities write directly via storage.* since
// they never involve placeholders.
export type Action =
  | { type: 'SET_VALUE'; property: Property; value: string }
  | { type: 'SET_NAME'; name: string }
  | {
      type: 'FIND_ENTITY'
      entity: {
        id: string
        name: string | null
        space?: string
        verified?: boolean
      }
    }
  | { type: 'CREATE_ENTITY'; name: string | null }

export type onChangeEntryFn = (
  entityId: string,
  spaceId: string,
  action: Action
) => void

export type onLinkEntryFn = (
  id: string,
  to: {
    id: string
    name: string | null
    space?: string
    verified?: boolean
  },
  currentlyVerified?: boolean
) => void

/**
 * Shared value write logic. Used by onChangeEntry (for placeholder rows)
 * and by ValueGroup/EditableValueGroup (for existing entities).
 */
export function writeValue(
  storage: Mutator,
  entityId: string,
  spaceId: string,
  property: Pick<Property, 'id' | 'name' | 'dataType'>,
  value: string,
  existingValue: Value | null
) {
  if (existingValue) {
    storage.values.update(existingValue, (draft) => {
      draft.value = value
    })
  } else {
    storage.values.set({
      entity: { id: entityId, name: null },
      property: {
        id: property.id,
        name: property.name,
        dataType: property.dataType,
      },
      spaceId,
      value,
    })
  }
}
```

Key changes:

- **Removed `SET_RELATION` and `DELETE_RELATION`** from the Action union. Relation editing uses direct `storage.*` calls. These never involve placeholders.
- **Simplified signature**: `(entityId, spaceId, action)` instead of `(context, event)`. The old `context` carried `entityName` which was only needed for the dead `renderable` construction.
- **`writeValue` helper** eliminates duplication between `onChangeEntry` and leaf cell components.

### Phase 2: Rewrite `onChangeEntry` in `table-block.tsx`

**File: `apps/web/partials/blocks/table/table-block.tsx`**

Replace the current `onChangeEntry` implementation (lines 148-260). Uses `writeValue` from `change-entry.ts` for the `SET_VALUE` case.

### Phase 3: Update TABLE view cells

**File: `apps/web/partials/entity-page/editable-entity-table-cell.tsx`**

#### 3a: Name cell — update `onChangeEntry` calls to new signature

```typescript
// Non-collection name edit:
onChange={value => {
  onChangeEntry(entityId, currentSpaceId, { type: 'SET_NAME', name: value });
}}

// FOC Find:
onDone={(result, fromCreateFn) => {
  if (fromCreateFn) return;
  onChangeEntry(entityId, spaceId, { type: 'FIND_ENTITY', entity: result });
}}

// FOC Create:
onCreateEntity={result => {
  onChangeEntry(entityId, spaceId, { type: 'CREATE_ENTITY', name: result.name });
}}
```

#### 3b: `ValueGroup` — add `spaceId` prop, `useMutate()`, use `writeValue` helper

#### 3c: `RelationsGroup` — add `useMutate()`, wire `storage.relations.*` directly

**Important:** Keep the existing `useRelations` selector (no `spaceId` filter) — TABLE view intentionally shows data from all spaces. Include `onCreateEntity` handler for `SelectEntity` (matching `EditableRelationsGroup` pattern).

### Phase 4: Update `table-block-property-field.tsx` values

**File: `apps/web/partials/blocks/table/table-block-property-field.tsx`**

Add `spaceId` prop to `EditableValueGroup` and `RenderedProperty`. Thread from `TableBlockPropertyField`. Use `writeValue` helper.

`EditableRelationsGroup` already works — no changes.

### Phase 5: Update LIST/GALLERY/BULLETED_LIST name editing

All files construct the `EVENT` → `UPSERT_RENDERABLE_TRIPLE_VALUE` payload for name editing. Update to new `onChangeEntry` signature.

**`table-block-list-item.tsx`:**

- Name edits → `{ type: 'SET_NAME', name: value }`
- Description edit → `{ type: 'SET_VALUE', property: descriptionProperty, value }`
- FOC Find/Create → `{ type: 'FIND_ENTITY', entity }` / `{ type: 'CREATE_ENTITY', name }`

**`table-block-gallery-item.tsx`:** Same as list item (minus description).

**`table-block-bulleted-list-item.tsx`:** Name-only changes.

## Execution order

1. **change-entry.ts** — new types + `writeValue` helper (everything else depends on this)
2. **table-block.tsx** — new `onChangeEntry` implementation
3. **editable-entity-table-cell.tsx** — TABLE view fixes (name + values + relations)
4. **table-block-property-field.tsx** — LIST/GALLERY value fixes
5. **table-block-list-item.tsx** — LIST name editing
6. **table-block-gallery-item.tsx** — GALLERY name editing
7. **table-block-bulleted-list-item.tsx** — BULLETED_LIST name editing

Steps 3-7 can be done in any order after 1-2. Each step is independently testable.

## What NOT to change

- `GeoStore` / `store.ts` — storage layer stays as-is
- `use-mutate.tsx` — `Mutator` API stays as-is
- `use-data-block.tsx` / `use-mapping.ts` — row computation stays as-is
- `entity-table-cell.tsx` — read-only cells stay as-is
- Placeholder lifecycle (`hasPlaceholderRow`, `pendingEntityId`, `shouldShowPlaceholder`) — keep the existing two-variable approach. Simplify in a follow-up.
- `onLinkEntry` — stays as a separate callback
- `react-table.d.ts` — `onChangeEntryFn` is already imported from `change-entry.ts`, type updates automatically

## Verification

After each phase, verify in the browser:

1. **TABLE view**: Edit a text cell, number cell, checkbox, date, and relation on an existing entity. Verify the value persists after blur/click-away.
2. **TABLE view**: Click "+", type a name in the placeholder row, verify entity is created and row appears.
3. **TABLE view**: Click "+", edit a non-name cell in the placeholder row (e.g., text), verify entity is created with the correct value.
4. **LIST view**: Edit name, description, and property fields on existing entities.
5. **GALLERY view**: Edit name and property fields on existing entities.
6. **BULLETED_LIST view**: Edit name on existing entities.
7. **Collection source**: Test FOC (Find existing entity, Create new entity) in all views.
8. **Non-collection source (SPACES/GEO)**: Test name editing + placeholder creation in all views.

## References

- `docs/brainstorms/2026-02-11-data-block-cell-writes-brainstorm.md` — design rationale
- `apps/web/partials/blocks/table/PLACEHOLDER_SYSTEM.md` — placeholder lifecycle docs
- `c640ae52` — the v2 commit that broke cell editing
