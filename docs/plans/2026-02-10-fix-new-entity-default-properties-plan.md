---
title: 'fix: New entity missing cover, avatar, and default properties in edit mode'
type: fix
date: 2026-02-10
---

# fix: New entity missing cover, avatar, and default properties in edit mode

When creating a new entity in edit mode, three things are broken:

1. **Cover/avatar upload areas don't appear** — the cover placeholder and avatar placeholder are missing from the header
2. **Properties panel shows "No properties added yet"** instead of showing Description
3. **Before a type is added**, the default properties (Description, Cover, Name) should be available but aren't

This is a regression from the v2/v3 migration. The fix previously existed in commit `f4d9104e` ("fix: schema defaults for new entities" #1080, Feb 2025) but was lost when `useEntitySchema` was rewritten.

## Root Cause

`useEntitySchema` in `entity-store.tsx:73-83` returns `[]` when an entity has no types:

```typescript
// entity-store.tsx:73-83
export function useEntitySchema(entityId: string, spaceId?: string) {
  const types = useEntityTypes(entityId, spaceId)

  const { data: schema } = useQuery({
    enabled: types.length > 0, // disabled when no types
    queryKey: ['entity-schema-for-merging', entityId, types],
    queryFn: async () => await getSchemaFromTypeIds(types.map((t) => t.id)),
  })

  return schema ?? [] // ← returns [] instead of DEFAULT_ENTITY_SCHEMA
}
```

A `DEFAULT_ENTITY_SCHEMA` constant already exists in `entities.ts:63-85` with Name, Description, Types, and Cover. The `useEntity` hook already uses it as a fallback (`schema ?? DEFAULT_ENTITY_SCHEMA` at line 54), but `useEntitySchema` does not.

### How this cascades

```
useEntitySchema returns []
  → usePlaceholderProperties returns {}          (use-renderables.ts:55-64)
    → useEditableProperties returns {}           (use-renderables.ts:120-135)
      → Cover/avatar header: renderedProperties[COVER_PROPERTY] is undefined
        → cover upload UI hidden                 (editable-entity-cover-avatar-header.tsx:52)
      → Properties panel: visiblePropertiesEntries is []
        → "No properties added yet"              (editable-entity-page.tsx:88)
```

## Acceptance Criteria

- [ ] Cover upload placeholder appears in edit mode on new entities (before any type is added)
- [ ] Avatar upload placeholder appears when entity's type schema includes it (existing behavior — Avatar was never in `DEFAULT_ENTITY_SCHEMA`)
- [ ] Properties panel shows Description field (not "No properties added yet") once panel is visible
- [ ] No flash of empty state when transitioning from no-types → has-types (adding a type shouldn't briefly hide cover/description)
- [ ] Existing entities with types continue to work identically

## Fix

### 1. `useEntitySchema` fallback → `DEFAULT_ENTITY_SCHEMA`

**File:** `apps/web/core/state/entity-page-store/entity-store.tsx:82`

Change:

```typescript
return schema ?? []
```

To:

```typescript
return schema ?? DEFAULT_ENTITY_SCHEMA
```

Import `DEFAULT_ENTITY_SCHEMA` from `~/core/database/entities`.

This handles both:

- **No types**: query disabled, `schema` is `undefined` → returns `DEFAULT_ENTITY_SCHEMA`
- **Loading types**: query enabled but pending, `schema` is `undefined` → returns `DEFAULT_ENTITY_SCHEMA` (prevents flash)

### 2. Add `keepPreviousData` to prevent flash during type transitions

**File:** `apps/web/core/state/entity-page-store/entity-store.tsx:76-81`

Add `placeholderData: keepPreviousData` to the `useQuery` options. This prevents the schema from briefly returning `undefined` when the query key changes (e.g., when types are added/removed). `keepPreviousData` is already imported in this file but unused.

```typescript
const { data: schema } = useQuery({
  enabled: types.length > 0,
  placeholderData: keepPreviousData,
  queryKey: ['entity-schema-for-merging', entityId, types],
  queryFn: async () => await getSchemaFromTypeIds(types.map((t) => t.id)),
})
```

### Why this is safe

- **Deduplication is already handled**: `getSchemaFromTypeIds` (entities.ts:122) prepends `DEFAULT_ENTITY_SCHEMA` and dedupes: `dedupeWith([...DEFAULT_ENTITY_SCHEMA, ...properties], ...)`. So the transition from fallback → query result is seamless — same base properties, plus type-specific ones.
- **SYSTEM_PROPERTIES filtering is correct**: Name, Types, Cover are already in `SYSTEM_PROPERTIES` (editable-entity-page.tsx:1057-1066) and filtered from the visible properties panel. Only Description shows in the panel — which is the intended behavior.
- **Browse mode is unaffected**: Browse mode uses `useRenderedPropertiesWithContent` (reads actual data, not schema) and `ReadableEntityPage` (doesn't call `useEntitySchema`).
- **Delete button logic is correct**: `schemaPropertyIds` (line 78-79) will include default properties, so Description won't show a delete button unless it has content — matching existing behavior for type-derived schema properties.

## Context

- **Prior fix**: `f4d9104e` ("fix: schema defaults for new entities" #1080, Feb 2025) — same issue, fixed on the old `useEntity` path
- **Regression introduced by**: v2/v3 migration (`c640ae52`, `3f6fc415`) which rewrote `useEntitySchema` with `return schema ?? []`
- **`useEntity` already has this pattern**: `entities.ts:54` uses `schema: schema ?? DEFAULT_ENTITY_SCHEMA`

## References

- `apps/web/core/state/entity-page-store/entity-store.tsx` — `useEntitySchema` (the fix location)
- `apps/web/core/database/entities.ts:63-85` — `DEFAULT_ENTITY_SCHEMA`
- `apps/web/core/hooks/use-renderables.ts:55-64` — `usePlaceholderProperties`
- `apps/web/core/hooks/use-renderables.ts:120-135` — `useEditableProperties`
- `apps/web/partials/entity-page/editable-entity-cover-avatar-header.tsx:50-56` — cover/avatar visibility
- `apps/web/partials/entity-page/editable-entity-page.tsx:88-97` — "No properties added yet"
- `apps/web/partials/entity-page/editable-entity-page.tsx:1057-1066` — `SYSTEM_PROPERTIES` filter
