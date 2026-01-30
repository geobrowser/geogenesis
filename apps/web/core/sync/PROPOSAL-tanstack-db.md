# Proposal: TanStack DB Migration

**Date**: January 29, 2026  
**Status**: Draft  
**Related**: `AUDIT.md`, task `ts-844240`

---

## Summary

Replace `reactiveValues`/`reactiveRelations` atoms and `GeoStore` with TanStack DB collections to gain fine-grained reactivity and built-in optimistic mutation handling.

This proposal presents two options:

- **Option A**: LocalOnlyCollection + our SyncEngine
- **Option B**: QueryCollection with TanStack-managed sync

---

## Problem

The current sync engine has scaling issues identified in the audit:

1. **Global reactivity** - Any change to `reactiveValues` or `reactiveRelations` triggers ALL `useSelector` subscribers, who then re-run `store.getEntity()` to reconstruct entities.

2. **Manual optimistic state** - We track `isLocal`, `isDeleted`, `hasBeenPublished` manually and filter at read time.

3. **No incremental updates** - Changing one value re-runs the full selector, even with `fast-deep-equal`.

---

## Option A: LocalOnlyCollection + Our SyncEngine

Use TanStack DB as the **storage and reactivity layer** only. Keep our existing sync orchestration (`SyncEngine`, `E.findMany`, etc.).

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Components                                   │
│   useQueryEntity, useQueryEntities, useValues, useRelations         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Query Hooks Layer                               │
│                                                                      │
│  useLiveQuery ──── WhereCondition ──→ TanStack DB predicates        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 TanStack DB LocalOnlyCollections                     │
│                                                                      │
│  ┌──────────────────┐    ┌─────────────────────┐                    │
│  │ valuesCollection │    │ relationsCollection │                    │
│  └──────────────────┘    └─────────────────────┘                    │
│                                                                      │
│  - Fine-grained subscriptions                                        │
│  - Sub-millisecond incremental updates                               │
│  - We manually populate from SyncEngine                              │
└─────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ populate
┌─────────────────────────────────────────────────────────────────────┐
│                   Our Sync Orchestration (kept)                      │
│                                                                      │
│  SyncEngine ──→ E.findMany ──→ WhereCondition ──→ GraphQL API       │
│  (batching)     (merge)        │                                    │
│  (dedup)                       └──→ convertWhereConditionToEntityFilter
│  (TTL)                                                               │
└─────────────────────────────────────────────────────────────────────┘
```

### Filter Translation

```
WhereCondition (our DSL)
        │
        ├──→ toTanStackPredicate()  ──→ useLiveQuery local filtering
        │
        └──→ convertWhereConditionToEntityFilter() ──→ GraphQL API
```

### Collections Setup

```typescript
// core/sync/collections.ts
import { localOnlyCollectionOptions } from '@tanstack/db';
import { createCollection } from '@tanstack/react-db';

export const valuesCollection = createCollection(
  localOnlyCollectionOptions({
    id: 'values',
    schema: valueSchema,
    getKey: value => value.id,
  })
);

export const relationsCollection = createCollection(
  localOnlyCollectionOptions({
    id: 'relations',
    schema: relationSchema,
    getKey: relation => relation.id,
  })
);
```

### Sync Integration

```typescript
// SyncEngine populates collections after fetch
private syncEntities(entities: Entity[]) {
  for (const entity of entities) {
    for (const value of entity.values) {
      const existing = valuesCollection.get(value.id)
      if (existing?.isLocal) continue // Local wins
      valuesCollection.insert(value)
    }
    for (const relation of entity.relations) {
      const existing = relationsCollection.get(relation.id)
      if (existing?.isLocal) continue
      relationsCollection.insert(relation)
    }
  }
}
```

### Query Hooks

```typescript
export function useQueryEntities({ where, first, skip, enabled }: QueryEntitiesOptions) {
  const cache = useQueryClient();
  const { stream } = useSyncEngine();

  // Remote fetch - uses our existing orchestration
  const { isFetched } = useQuery({
    enabled,
    queryKey: ['store', 'entities', JSON.stringify(where), first, skip],
    queryFn: async () => {
      const entities = await E.findMany({ where, first, skip, cache });
      stream.emit({ type: 'entities:synced', entities });
      return entities;
    },
  });

  // Local query - TanStack DB live query with translated predicates
  const { data: matchingValues } = useLiveQuery(q =>
    q.from({ value: valuesCollection }).where(toTanStackPredicate(where))
  );

  const { data: matchingRelations } = useLiveQuery(q =>
    q.from({ relation: relationsCollection }).where(toTanStackPredicate(where))
  );

  // Reconstruct entities from values + relations
  const entities = useMemo(() => {
    return reconstructEntities(matchingValues, matchingRelations).slice(skip, skip + first);
  }, [matchingValues, matchingRelations, first, skip]);

  return { entities, isLoading: !isFetched && enabled };
}
```

### What Changes

| Component                              | Before              | After                         |
| -------------------------------------- | ------------------- | ----------------------------- |
| `reactiveValues` / `reactiveRelations` | xstate atoms        | TanStack DB collections       |
| `useSelector(reactive, ...)`           | Global subscription | `useLiveQuery` (fine-grained) |
| `EntityQuery` class                    | Manual filtering    | TanStack DB predicates        |
| `GeoStore`                             | State management    | Removed                       |
| `SyncEngine`                           | Unchanged           | Populates collections         |
| `E.findMany` / `E.merge`               | Unchanged           | Unchanged                     |
| `WhereCondition` DSL                   | Unchanged           | Translated to both targets    |
| `convertWhereConditionToEntityFilter`  | Unchanged           | Unchanged                     |

### Pros

- Minimal architectural change - just swap storage layer
- Keep battle-tested sync logic (batching, dedup, TTL, merge)
- Keep full control over when/what to sync
- Easier migration path - can run in parallel

### Cons

- Still maintaining two filter translations (TanStack + GraphQL)
- Manual optimistic state management (`isLocal` flags)
- Not using TanStack DB's built-in optimistic mutation handling

---

## Option B: QueryCollection with TanStack-Managed Sync

Use TanStack DB's `QueryCollection` with `syncMode: 'on-demand'`. TanStack DB manages sync, we translate filters for the API.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Components                                   │
│   useQueryEntity, useQueryEntities, useValues, useRelations         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      useLiveQuery                                    │
│                                                                      │
│  Live queries trigger collection sync automatically                  │
│  Predicates passed to queryFn via ctx.meta.loadSubsetOptions        │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 TanStack DB QueryCollections                         │
│                                                                      │
│  ┌──────────────────┐    ┌─────────────────────┐                    │
│  │ valuesCollection │    │ relationsCollection │                    │
│  │ (QueryCollection)│    │ (QueryCollection)   │                    │
│  └──────────────────┘    └─────────────────────┘                    │
│                                                                      │
│  - TanStack manages when to fetch                                    │
│  - Built-in optimistic mutations                                     │
│  - Automatic request deduplication                                   │
│  - Respects TanStack Query cache policies                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ queryFn receives predicates
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         queryFn                                      │
│                                                                      │
│  async (ctx) => {                                                   │
│    const predicates = ctx.meta?.loadSubsetOptions                   │
│    const where = tanstackPredicatesToWhereCondition(predicates)     │
│    const filter = convertWhereConditionToEntityFilter(where)        │
│    const entities = await getAllEntities({ filter })                │
│    return entities.flatMap(e => e.values) // or relations           │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Filter Translation

```
TanStack DB predicates (from useLiveQuery .where())
        │
        ▼
tanstackPredicatesToWhereCondition()  // NEW - reverse translation
        │
        ▼
WhereCondition (our DSL)
        │
        ▼
convertWhereConditionToEntityFilter() // existing
        │
        ▼
EntityFilter (GraphQL)
```

### Collections Setup

```typescript
// core/sync/collections.ts
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';

export const valuesCollection = createCollection(
  queryCollectionOptions({
    id: 'values',
    schema: valueSchema,
    getKey: value => value.id,
    syncMode: 'on-demand',

    queryKey: ['values'],
    queryFn: async ctx => {
      // TanStack passes predicates from useLiveQuery
      const predicates = ctx.meta?.loadSubsetOptions;

      // Translate: TanStack predicates → WhereCondition → GraphQL
      const where = tanstackPredicatesToWhereCondition(predicates);
      const filter = convertWhereConditionToEntityFilter(where);

      const entities = await getAllEntities({ filter });
      return entities.flatMap(e => e.values);
    },

    onUpdate: async ({ transaction }) => {
      // Handle optimistic updates - called when value is mutated
      // Could be no-op if we batch publish separately
    },
  })
);

export const relationsCollection = createCollection(
  queryCollectionOptions({
    id: 'relations',
    schema: relationSchema,
    getKey: relation => relation.id,
    syncMode: 'on-demand',

    queryKey: ['relations'],
    queryFn: async ctx => {
      const predicates = ctx.meta?.loadSubsetOptions;
      const where = tanstackPredicatesToWhereCondition(predicates);
      const filter = convertWhereConditionToEntityFilter(where);

      const entities = await getAllEntities({ filter });
      return entities.flatMap(e => e.relations);
    },
  })
);
```

### Query Hooks

```typescript
export function useQueryEntities({ where, first, skip, enabled }: QueryEntitiesOptions) {
  // Convert our WhereCondition to TanStack predicates
  const predicate = whereConditionToTanStackPredicate(where);

  // TanStack DB handles everything:
  // 1. Checks if data matching predicate is in collection
  // 2. If not, calls queryFn with predicates in ctx.meta
  // 3. queryFn translates back and fetches from API
  // 4. Returns reactive results

  const { data: matchingValues } = useLiveQuery(q => q.from({ value: valuesCollection }).where(predicate));

  const { data: matchingRelations } = useLiveQuery(q => q.from({ relation: relationsCollection }).where(predicate));

  const entities = useMemo(() => {
    return reconstructEntities(matchingValues, matchingRelations).slice(skip, skip + first);
  }, [matchingValues, matchingRelations, first, skip]);

  return { entities };
}
```

### Write Path with Built-in Optimistic Updates

```typescript
export function useMutate() {
  return {
    setValue(value: Value) {
      // TanStack DB automatically:
      // 1. Applies optimistic state to collection
      // 2. Calls onUpdate handler
      // 3. On success, merges server response
      // 4. On failure, rolls back optimistic state
      valuesCollection.update(value.id, draft => {
        Object.assign(draft, value);
      });
    },

    deleteValue(value: Value) {
      valuesCollection.delete(value.id);
      // Or soft delete:
      // valuesCollection.update(value.id, (draft) => { draft.isDeleted = true })
    },
  };
}
```

### What Changes

| Component                              | Before                 | After                                      |
| -------------------------------------- | ---------------------- | ------------------------------------------ |
| `reactiveValues` / `reactiveRelations` | xstate atoms           | QueryCollections                           |
| `useSelector`                          | Global subscription    | `useLiveQuery`                             |
| `SyncEngine`                           | Our implementation     | **Removed** - TanStack manages             |
| `E.findMany` / `E.findOne`             | Fetch orchestration    | **Removed** - in queryFn                   |
| `E.merge`                              | Local-wins merge       | **Simplified** - TanStack optimistic state |
| `WhereCondition` DSL                   | Source of truth        | Intermediate (translated both ways)        |
| `GeoEventStream`                       | Event bus              | **Removed** or minimal                     |
| Optimistic updates                     | Manual `isLocal` flags | Built-in to TanStack DB                    |

### New Code Required

```typescript
// core/sync/filter-adapters.ts

// WhereCondition → TanStack predicate (for useLiveQuery)
export function whereConditionToTanStackPredicate(where: WhereCondition) {
  return ({ value }: { value: Value }) => {
    // ... translate conditions to predicate function
  };
}

// TanStack predicates → WhereCondition (for queryFn)
export function tanstackPredicatesToWhereCondition(loadSubsetOptions: LoadSubsetOptions): WhereCondition {
  // Reverse translation from TanStack's predicate format
  // to our WhereCondition DSL
}
```

### Pros

- Full TanStack DB experience - optimistic updates, cache management
- Less code to maintain - no SyncEngine, simpler merge logic
- Automatic request deduplication and caching via TanStack Query
- Cleaner write path - mutations just work

### Cons

- **Bidirectional filter translation** - WhereCondition ↔ TanStack predicates
- Lose fine-grained control over batching (TanStack batches per-query, not across queries)
- More "magic" - harder to debug sync issues
- Our API returns Entity[], need to destructure to values/relations
- Bigger migration - replacing more of the system

---

## Comparison

| Aspect                 | Option A (LocalOnly)     | Option B (QueryCollection) |
| ---------------------- | ------------------------ | -------------------------- |
| **Sync control**       | Full (our SyncEngine)    | TanStack-managed           |
| **Batching**           | Custom (across queries)  | Per-query (TanStack)       |
| **Optimistic updates** | Manual (`isLocal` flags) | Built-in                   |
| **Filter translation** | One direction            | Bidirectional              |
| **Code to maintain**   | More (SyncEngine stays)  | Less                       |
| **Migration effort**   | Lower                    | Higher                     |
| **Debugging**          | Familiar                 | New patterns               |
| **API fit**            | Good (we control fetch)  | Awkward (Entity→Values)    |

---

## Recommendation

**Start with Option A** for these reasons:

1. **Lower risk** - Smaller change surface, easier rollback
2. **API shape** - Our API returns `Entity[]`, not flat `Value[]`/`Relation[]`. Option B requires destructuring in queryFn which feels backwards.
3. **Batching** - We have specific batching requirements (dedup across components, TTL). Option A preserves this.
4. **Incremental** - Can migrate to Option B later if we find we want more TanStack features

However, **prototype both** in the spike to validate assumptions.

---

## Migration Path (Option A)

### Phase 1: Add Collections (Parallel)

- Add `valuesCollection` and `relationsCollection` as LocalOnlyCollections
- Mirror writes to both old atoms and new collections
- No consumer changes yet

### Phase 2: Migrate Read Path

- Replace `useSelector` calls with `useLiveQuery`
- Build `toTanStackPredicate()` incrementally
- Test reactivity improvements

### Phase 3: Migrate Write Path

- Replace `store.setValue()` etc. with collection operations
- Remove old atoms and `GeoStore`

### Phase 4: Cleanup

- Remove `experimental_query-layer.ts` (replaced by TanStack predicates)
- Simplify `GeoEventStream` (may not need all events)

---

## Migration Path (Option B)

### Phase 1: Build Filter Adapters

- Implement bidirectional filter translation
- Test round-trip: WhereCondition → TanStack → WhereCondition

### Phase 2: Create QueryCollections

- Set up collections with queryFn
- Handle Entity[] → Value[]/Relation[] destructuring

### Phase 3: Migrate Queries

- Replace all query hooks with useLiveQuery
- Remove SyncEngine, E.findMany, etc.

### Phase 4: Migrate Writes

- Replace store mutations with collection operations
- Implement onUpdate/onInsert/onDelete handlers

---

## Open Questions

1. **Entity reconstruction** - With flat collections, we reconstruct entities from values/relations in useMemo. Performance impact?

2. **Backlinks** - Currently O(N×M×R). Either option should improve this with proper indexing, but need to verify.

3. **SSR/Hydration** - TanStack DB is client-side. How does this interact with our SSR prefetching?

4. **TanStack DB stability** - Beta (v0.1.69). Monitor for breaking changes.

5. **Option B batching** - TanStack's `syncMode: 'on-demand'` fetches per-query. Can we batch across queries? Worth investigating `loadSubsetOptions` behavior.

---

## Next Steps

1. [ ] Spike Option A: LocalOnlyCollection with one entity type
2. [ ] Spike Option B: QueryCollection with filter round-trip
3. [ ] Benchmark both against current implementation
4. [ ] Team review and decision
5. [ ] Full implementation of chosen option
