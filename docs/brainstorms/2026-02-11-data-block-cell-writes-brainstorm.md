---
date: 2026-02-11
topic: data-block-cell-writes
---

# Data Block Cell Writes

## Context

Cell editing in data block tables stopped working in the `stream: v2` commit (c640ae52, Dec 16 2025). The commit replaced working `storage.*` calls in `editable-entity-table-cell.tsx` with commented-out `onChangeEntry` stubs referencing variables that don't exist in scope. All non-name cell writes (values, relations) are no-ops. Name edits still work because they go through a separate code path.

The placeholder system — which manages adding new rows — works but is fragile. It uses two boolean/string state variables (`hasPlaceholderRow`, `pendingEntityId`) plus an effect to bridge an async gap that may not actually exist with synchronous store writes.

## What We're Building

Reconnect cell writes and simplify the placeholder lifecycle. The architecture stays the same (cells subscribe to the store for reads, writes go through a central function, placeholder is a fake row not in the store). What changes:

1. **Well-typed action union** replaces the nested `EVENT` → `UPSERT_RENDERABLE_TRIPLE_VALUE` → `renderable` structure
2. **Simple placeholder state machine** replaces `hasPlaceholderRow` + `pendingEntityId` + bridging effect
3. **All cell types get working write handlers** wired to the new action types

## The Design

### Reads (unchanged)

- `useDataBlock` computes rows from the store (via `useQueryEntity`/`useQueryEntities`)
- `mappingToRows` creates `Row` objects with `Cell` stubs (entityId, slotId, name)
- Each cell reads its own data via `useValue`/`useRelations` (per-cell subscriptions, acceptable for now)

### Writes

One write function: `onChangeEntry(entityId, spaceId, action)`

The action is a discriminated union:

```ts
type Action =
  | { type: 'SET_VALUE'; property: Property; value: string }
  | {
      type: 'SET_RELATION'
      property: Property
      toEntity: { id: string; name: string | null }
    }
  | { type: 'DELETE_RELATION'; relationId: string }
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
```

`onChangeEntry` does two things in order:

1. **Ensure the entity exists.** If `entityId` matches the placeholder's pre-generated ID, create the entity first (name value, type relations from filters, collection item relation if collection source). Dismiss the placeholder.
2. **Execute the action.** Route to the appropriate `storage.*` call:
   - `SET_VALUE` → `storage.values.set` (new) or `storage.values.update` (existing)
   - `SET_RELATION` → `storage.relations.set`
   - `DELETE_RELATION` → `storage.relations.delete`
   - `SET_NAME` → `storage.entities.name.set`
   - `FIND_ENTITY` → create collection item relation (entity already exists, just linking it)
   - `CREATE_ENTITY` → same as committing a placeholder with a name

### Placeholder lifecycle

Two-state machine:

- **`idle`**: No placeholder shown.
- **`active(entityId)`**: Fake row at top of table with pre-generated `entityId`.

Transitions:

- `idle` → `active(nextId)`: User clicks "+". `nextId` comes from `useCreateEntityWithFilters`.
- `active(id)` → `idle`: Any `onChangeEntry` call where `entityId === id`. The entity gets created in step 1 of `onChangeEntry`, and the placeholder is dismissed.

No `pendingEntityId`. No bridging effect. Store writes are synchronous — the entity appears in query results in the same React render that dismisses the placeholder.

### Collection Find-or-Create

When placeholder is active and source is `COLLECTION`, the name cell renders `SelectEntity` (FOC):

- **Find** → `onChangeEntry(placeholderId, spaceId, { type: 'FIND_ENTITY', entity: result })`. Creates collection item relation pointing to the found entity. Placeholder dismissed. Found entity's row appears via reactive query.
- **Create** → `onChangeEntry(placeholderId, spaceId, { type: 'CREATE_ENTITY', name: result.name })`. Creates entity + collection item relation. Placeholder dismissed. New entity's row appears via reactive query.

## Key Decisions

- **Fake placeholder row, not a real entity**: Creating a real entity on "+" would risk publishing empty entities. The publish pipeline doesn't filter them out. Keeping the placeholder as a UI-only row avoids this.
- **Per-cell subscriptions stay**: Each cell reads via `useValue`/`useRelations`. Acceptable for now. Consolidating to props-from-parent is a separate optimization.
- **Store round-trip for writes**: Writes go to the store, the reactive atom updates, the cell re-renders with new data. No optimistic local state in cells. This is fine because the store is local and synchronous.
- **Single write entry point**: All cell writes go through `onChangeEntry`. Cells don't call `storage.*` directly. This keeps placeholder lifecycle management in one place.

## What Changes (files)

- `apps/web/partials/blocks/table/change-entry.ts` — new `Action` type, updated `onChangeEntryFn` signature
- `apps/web/partials/blocks/table/table-block.tsx` — simplified `useEntries` with two-state placeholder, new `onChangeEntry` implementation
- `apps/web/partials/entity-page/editable-entity-table-cell.tsx` — wire `ValueGroup` and `RelationsGroup` to call `onChangeEntry` with new action types

## What Does NOT Change

- `apps/web/core/sync/store.ts` — GeoStore stays as-is
- `apps/web/core/sync/use-mutate.tsx` — Mutator API stays as-is
- `apps/web/core/sync/use-store.tsx` — reactive hooks stay as-is
- `apps/web/core/blocks/data/use-data-block.tsx` — row computation stays as-is
- `apps/web/core/blocks/data/use-mapping.ts` — `mappingToRows` stays as-is
- `apps/web/partials/entities-page/entity-table-cell.tsx` — read-only cells stay as-is

## Open Questions

- Should `onChangeEntry` also handle the `onLinkEntry` concern (updating a collection item relation's `toSpaceId`/`verified`)? Currently that's a separate callback. Could be a `LINK_ENTITY` action.
- Do list/gallery/bulleted-list views need any special handling, or do they use the same `onChangeEntry`? Currently they all receive `onChangeEntry` as a prop.

## Next Steps

→ `/workflows:plan` for implementation details
