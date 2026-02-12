# Placeholder System

## What it solves

When a user clicks "+" to add a new row to a data block, we need to show an empty row at the top of the table immediately, before any entity exists in the store. The row needs to:

- Appear at position 0 (top of the list)
- Have empty cells matching the table's columns
- Autofocus the name cell so the user can start typing
- Eventually transition into a real entity in the store

## State

Two pieces of React state in `useEntries`:

**`hasPlaceholderRow`** (boolean) — "the user clicked + and we haven't committed an entity yet"

- Set to `true` by `onAddPlaceholder`
- Set to `false` when `onChangeEntry` is called with `context.entityId === nextEntityId` — meaning the user did something in the placeholder row

**`pendingEntityId`** (string | null) — "we've committed an entity to the store but it hasn't appeared in the query results yet"

- Set when `onChangeEntry` creates a collection item or entity
- Cleared by an effect when `entries` includes that entity ID
- This bridges the gap between "we wrote to the store" and "the reactive query returned it as a row"

## Pre-generated entity ID

`useCreateEntityWithFilters` holds a `nextEntityId` — a UUID generated ahead of time. This is the ID that will be used for the next entity that gets created. After creation, it generates a fresh one.

The placeholder row uses this `nextEntityId` as its `entityId`. This means when the entity is eventually created in the store, its ID matches what the placeholder was already using.

## Visibility logic

```ts
const shouldShowPlaceholder =
  isEditing &&
  ((hasPlaceholderRow && !entries.find(e => e.entityId === nextEntityId)) ||
    (pendingEntityId && !entries.find(e => e.entityId === pendingEntityId)));
```

Show the placeholder if editing AND either:

1. User clicked "+" (`hasPlaceholderRow`) and no real entry exists with `nextEntityId` yet
2. We created an entity (`pendingEntityId`) but it hasn't appeared in query results yet

Case 2 prevents a flash where the placeholder disappears (because `hasPlaceholderRow` was cleared) but the real row hasn't appeared yet.

## The placeholder Row object

`makePlaceholderRow` creates a `Row` with:

- `placeholder: true`
- `entityId` = the pre-generated `nextEntityId`
- A `Cell` for each column with `name: null` and a fresh random `propertyId`

It's prepended to the entries array: `[placeholder, ...realEntries]`

## What happens when the user interacts with the placeholder

### Flow 1: Collection + Find (pick existing entity)

User clicks "+", sees `SelectEntity` in the name cell, picks "Albert Einstein":

1. Cell calls `onChangeEntry({ entityId: nextEntityId }, { type: 'Find', data: { id: 'albert-id', name: 'Albert Einstein' } })`
2. `onChangeEntry`:
   - Skips the `EVENT` branch — event type is `Find`
   - Enters COLLECTION branch: entity not in entries → creates collection item relation pointing to `albert-id`, sets `pendingEntityId = 'albert-id'`
   - Enters placeholder branch: `context.entityId === nextEntityId` → sets `hasPlaceholderRow = false`. Event is `Find`, so skips `createEntityWithTypes` — the entity already exists
3. Placeholder stays visible because `pendingEntityId` is set and `albert-id` isn't in entries yet
4. Reactive store processes the new collection item relation → `useCollection` picks it up → `useDataBlock` returns a row for Albert Einstein → `entries` now includes `albert-id` → effect clears `pendingEntityId` → placeholder disappears, real row takes its place

### Flow 2: Collection + Create (type a new name)

User clicks "+", types "New Person" in the `SelectEntity`, hits create:

1. Cell calls `onChangeEntry({ entityId: nextEntityId }, { type: 'Create', data: { name: 'New Person' } })`
2. `onChangeEntry`:
   - Skips `EVENT` branch
   - COLLECTION branch: entity not in entries → `to = { ...data, id: nextEntityId }` → creates collection item relation pointing to `nextEntityId`, sets `pendingEntityId = nextEntityId`
   - Placeholder branch: `context.entityId === nextEntityId` → `hasPlaceholderRow = false`. Event is `Create` → calls `createEntityWithTypes({ name: 'New Person', filters })` which creates name value + type relations for `nextEntityId`, then generates a new `nextEntityId`
3. Same visibility bridge via `pendingEntityId`

### Flow 3: Non-collection (SPACES/GEO), user types a name

User clicks "+", types "New Entity" in the `PageStringField`:

1. Cell calls `onChangeEntry({ entityId: nextEntityId, entityName: 'New Entity' }, { type: 'EVENT', data: { type: 'UPSERT_RENDERABLE_TRIPLE_VALUE', payload: { renderable: { attributeId: NAME_PROPERTY, ... }, value: { value: 'New Entity' } } } })`
2. `onChangeEntry`:
   - EVENT branch: `attributeId === NAME_PROPERTY` → `storage.entities.name.set(nextEntityId, spaceId, 'New Entity')`
   - COLLECTION branch: source is not COLLECTION → skipped
   - Placeholder branch: `context.entityId === nextEntityId` → `hasPlaceholderRow = false`. Event is `EVENT` (not `Find`) → `createEntityWithTypes({ name: undefined, filters })` — this creates type relations but NOT the name (name was already set above). Generates new `nextEntityId`. Sets `pendingEntityId = nextEntityId` (the old one)
3. Visibility bridge via `pendingEntityId`

## Autofocus

`usePlaceholderAutofocus` tracks whether a new placeholder appeared by comparing the placeholder's `entityId` against a ref. Returns `true` only on the first render after a new placeholder is added. This gets threaded down to the name cell's `autoFocus` prop.

## Summary

The placeholder system is a **two-phase commit for row creation**:

1. **Phase 1 (optimistic UI):** Show a fake row immediately with a pre-generated ID. No store writes.
2. **Phase 2 (commit):** When the user fills in the name cell, write the entity to the store. The `pendingEntityId` bridge keeps the row visible during the async gap between "wrote to store" and "query returned the new row."

The pre-generated ID is the key trick — it lets the placeholder and the eventual real entity share the same ID, so there's no ID mismatch when the real row replaces the placeholder.
