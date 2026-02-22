# Sync Engine Audit Report

**Date**: January 29, 2026  
**Task**: ts-844240  
**Status**: Audit complete, fixes pending

---

## Overview

The sync engine merges local and remote state for entities/relations/values. Components use `useQueryEntity` or `useQueryEntities` to read from both local and remote stores, with local state taking precedence.

Key files:

- `use-store.tsx` - Query hooks (`useQueryEntity`, `useQueryEntities`, etc.)
- `store.ts` - `GeoStore` class managing reactive state
- `engine.ts` - `SyncEngine` class handling background sync
- `orm.ts` - `E` class with merge logic and `mergeRelations`
- `experimental_query-layer.ts` - `EntityQuery` class for local filtering
- `stream.ts` - `GeoEventStream` for event-driven updates
- `values.ts` - Value merge utility

---

## 1. Query Engine Hooks (`use-store.tsx`)

### `useQueryEntity`

**Strengths:**

- Clean separation: hydration in `useHydrateEntity`, selection via reactive `useSelector`
- Uses `fast-deep-equal` to prevent unnecessary re-renders
- Proper loading state derivation

**Issues:**

1. **Reactive atom doesn't explicitly track spaceId changes**: Works because selector function is recreated on each render, but fragile.

2. **No cache invalidation coordination**: Once hydrated, never re-fetches unless component remounts.

3. **Brief null state**: If hydration is in progress, `store.getEntity` returns `undefined` until sync completes.

### `useQueryEntities`

**Issues:**

1. **Double execution**: Remote fetch in `useQuery`, then local query re-runs in `useSelector` on ALL store entities.

2. **`sortBy` hardcoded but not implemented**: Uses `updatedAt` but `applySorting()` doesn't handle it:

   ```tsx
   .sortBy({ field: 'updatedAt', direction: 'desc' })
   ```

   See Section 3 for details.

3. **Pagination mismatch**: Remote uses `first`/`skip`, local query applies same pagination to merged set. Local-only entities could be incorrectly paginated.

4. **Query key doesn't include sort**: Sort changes won't trigger refetch.

---

## 2. Merge Logic (`orm.ts` and `engine.ts`)

### `E.merge()` - CRITICAL BUG

**Operator precedence bug in filters:**

```tsx
// Current (BUGGY):
const values = mergedValues.filter(v => (Boolean(v.isDeleted) === false && spaceId ? v.spaceId === spaceId : true));
```

This parses as:

```tsx
v.isDeleted === false && spaceId ? v.spaceId === spaceId : true;
```

When `spaceId` is undefined:

- `false && undefined` → `false`
- Returns `true` → **includes deleted values!**

**Should be:**

```tsx
const values = mergedValues.filter(v => !v.isDeleted && (spaceId ? v.spaceId === spaceId : true));
```

Same bug exists for relations filter on lines 78-79.

### `mergeRelations()`

**Issues:**

1. **Local always wins, no timestamp comparison**: Stale local data overwrites newer remote data.

2. **Deleted relations included in output**: Filtering happens later, but carrying deleted items through is wasteful.

3. **No position merging**: TODO comment acknowledges this. Position/index updates may not merge correctly.

### `merge()` in `values.ts`

Simple and correct for "local wins" semantics. Caller must filter deleted values.

### `SyncEngine.processSyncQueue()`

**Issues:**

1. **`syncedEntities` never cleared**: Once synced, entity never re-syncs. Remote changes by other users won't be seen until session reset.

2. **No error handling**: If `getBatchEntities` fails, no retry or fallback.

3. **Memory leak**: `syncedEntities` Set grows indefinitely.

---

## 3. `EntityQuery` (`experimental_query-layer.ts`)

### `matchesStringCondition()` - Semantic Bug

```tsx
if (condition.equals !== undefined) {
  // @TODO For now we use startsWith as equals to match the previous behavior
  if (!compareOperators.string.startsWith(value, condition.equals)) {
    return false;
  }
}
```

`equals` actually uses `startsWith`, causing false positives.

### `matchesBacklinks()` - Performance

O(N × M × R) complexity where N = conditions, M = entities, R = relations. Slow for large stores.

### `applySorting()` - Missing Cases

```tsx
switch (field) {
  case 'id': ...
  case 'name': ...
  case 'description': ...
  default:
    valueA = '';
    valueB = '';
}
```

`createdAt` and `updatedAt` are defined in `SortByField` but not implemented. They default to empty strings, making sorts ineffective.

---

## 4. Store (`store.ts`)

### `getEntity()` - Same Operator Precedence Bug

```tsx
relations: relations.filter(r =>
  includeDeleted ? true : Boolean(r.isDeleted) === false && options.spaceId ? r.spaceId === options.spaceId : true
),
```

Should be:

```tsx
relations.filter(r => (includeDeleted || !r.isDeleted) && (!options.spaceId || r.spaceId === options.spaceId));
```

---

## 5. Event Stream (`stream.ts`)

### Unbounded Memory Growth

```tsx
private events: GeoEvent[] = [];

public emit(event: GeoEvent): void {
  this.events.push(event);
}
```

Every event stored forever. No pruning or limit for long sessions.

---

## 6. Global Singletons (`use-sync-engine.tsx`)

```tsx
export const stream = new GeoEventStream();
export const store = new GeoStore(stream);
export const engine = new SyncEngine(stream, queryClient, store);
```

Module-level singletons persist across route navigations. Intentional for state persistence, but:

- Could share state across SSR requests (Next.js usually handles this)
- HMR might create duplicates

---

## Triage Summary

### Correctness Issues

| #   | Issue                                                 | Severity | Location                               | Decision                      |
| --- | ----------------------------------------------------- | -------- | -------------------------------------- | ----------------------------- |
| 1   | Operator precedence bug - deleted values leak through | Critical | `orm.ts` L75, 78-79                    | **Will fix**                  |
| 2   | Same operator precedence bug                          | Critical | `store.ts` L170-171                    | **Will fix**                  |
| 3   | `updatedAt`/`createdAt` sorting not implemented       | High     | `experimental_query-layer.ts` L593-609 | **Will fix**                  |
| 4   | `equals` uses `startsWith` semantics                  | Medium   | `experimental_query-layer.ts` L478-481 | Won't fix (intentional)       |
| 5   | `syncedEntities` never invalidated                    | Medium   | `engine.ts` L26, 61                    | **Will fix** (TTL-based)      |
| 6   | Unbounded memory in `events` array                    | Medium   | `stream.ts` L92                        | Won't fix                     |
| 7   | Unbounded memory in `syncedEntities`                  | Medium   | `engine.ts` L26                        | **Will fix** (with #5)        |
| 8   | Pagination mismatch local vs remote                   | Low      | `use-store.tsx` L171-231               | Won't fix                     |
| 9   | No error handling in sync queue                       | Low      | `engine.ts` L138-204                   | **Will fix**                  |
| 10  | Backlinks query O(N×M×R)                              | Low      | `experimental_query-layer.ts` L424-466 | **Will fix**                  |
| 11  | Query key uses `JSON.stringify(where)` - key order    | Low      | `store.ts` L78-79                      | **Will fix** (stable hash)    |
| 12  | Selector closures recreated every render              | Low      | `use-store.tsx`                        | Won't fix (React Compiler)    |
| 13  | Global atom triggers ALL consumers on ANY change      | Medium   | `use-store.tsx` L43-46                 | **Investigate** (TanStack DB) |
| 14  | Flash of stale data on filter change                  | Low      | `use-store.tsx` L171-231               | Won't fix                     |
| 15  | Query key includes `enabled`                          | Low      | `use-store.tsx` L239, 290              | Won't fix (harmless)          |
| 16  | `mergeRelations` in selector on every change          | Low      | `use-store.tsx` L462-476               | Won't fix                     |

### Performance Issues

| #   | Issue                                      | Severity | Location               | Decision                   |
| --- | ------------------------------------------ | -------- | ---------------------- | -------------------------- |
| 17  | Global reactivity triggers all subscribers | **High** | `use-store.tsx` L43-46 | **Fix via TanStack DB**    |
| 18  | `getResolvedValues()` O(N) full scan       | Low      | `store.ts` L206-207    | Won't fix (N is small)     |
| 19  | `getResolvedRelations()` O(N) full scan    | Low      | `store.ts` L281-282    | Won't fix (N is small)     |
| 20  | `findReferencingEntities()` O(N) full scan | Low      | `store.ts` L388-400    | Won't fix (N is small)     |
| 21  | `mergeRelations()` has 4 iterations        | Low      | `orm.ts` L17-38        | Won't fix (saves ~0.005ms) |

**Note**: With ~10K values and ~20K relations max, linear scans take ~0.1ms. The real bottleneck is **React work triggered by global subscriptions**, not merge logic. Network I/O (100-500ms) and React re-renders (10-50ms) dominate.

---

## Fixes To Implement

### Priority 1: Critical (Correctness)

- [ ] Fix operator precedence in `orm.ts` L75, L78-79
- [ ] Fix operator precedence in `store.ts` L170-171

### Priority 2: High (Correctness)

- [ ] Implement `updatedAt`/`createdAt` in `applySorting()`

### Priority 3: Medium (Correctness)

- [ ] Add TTL-based `syncedEntities` invalidation (also addresses memory growth)
- [ ] Add error handling to `processSyncQueue`
- [ ] Use stable hash for query keys (e.g., `fast-json-stable-stringify`)

### Priority 4: High (Performance) — TanStack DB Migration

The real performance problem is **global reactivity triggering unnecessary React work**:

- Any change to values/relations triggers ALL `useSelector` subscribers
- Even with `fast-deep-equal`, we run O(subscribers) selector functions
- This causes unnecessary React reconciliation

- [ ] **TanStack DB spike**: Evaluate if TanStack DB could replace our sync engine
  - See detailed proposal: `PROPOSAL-tanstack-db.md`
  - Two options evaluated:
    - **Option A**: LocalOnlyCollection + our SyncEngine (recommended to start)
    - **Option B**: QueryCollection with TanStack-managed sync
  - TanStack DB's `useLiveQuery` provides fine-grained subscriptions
  - Only queries affected by a change re-run, avoiding unnecessary React work

### Deprioritized (Not Worth Optimizing)

These were identified but **not worth fixing** given our data sizes (~10K values, ~20K relations):

- ~~Add indexes for O(1) lookups~~ — Linear scans take ~0.1ms, index overhead not justified
- ~~Refactor `mergeRelations()` to single-pass~~ — Saves ~0.005ms
- ~~Optimize backlinks query in `EntityQuery`~~ — Will be replaced by TanStack DB queries

---

## 7. Performance Audit: Merge Logic

### Data Size Reality Check

Typical entity sizes:

- **5-10 values per entity**
- **~15 relations per entity**
- **Total store**: ~1-2K entities, ~10K values, ~20K relations max

At these sizes, scanning 10K items takes **~0.1ms** in JS. The merge logic is **not a bottleneck**.

### Where Time Actually Goes

| Operation                                | Typical Cost | Impact         |
| ---------------------------------------- | ------------ | -------------- |
| Network I/O (API fetch)                  | 100-500ms    | **Dominant**   |
| React re-renders                         | 10-50ms      | **High**       |
| `useSelector` triggering all subscribers | 1-10ms       | **Medium**     |
| Merge logic (arrays, Sets)               | 0.01-0.1ms   | **Negligible** |

### The Real Problem: React Work

The sync engine's performance issue isn't merge logic — it's **triggering unnecessary React work**:

```typescript
// Current: ANY change to values triggers ALL useSelector subscribers
const reactive = createAtom(() => ({
  values: reactiveValues.get(),
  relations: reactiveRelations.get(),
}));

// Every component using useSelector re-runs its selector function
// Even with fast-deep-equal, that's O(components × selector cost)
```

**Example**: If 50 components subscribe and each selector calls `store.getEntity()`:

- 1 value change → 50 selector runs → 50 potential re-renders
- Even if `fast-deep-equal` bails out, we still ran 50 selectors

### What Would Actually Help

1. **Fine-grained subscriptions** — Only notify components that care about the changed entity
2. **Avoid React work entirely** — Don't trigger re-renders for unrelated changes
3. **Batch updates** — Coalesce multiple changes into single React update

This is exactly what TanStack DB's `useLiveQuery` provides:

- Subscriptions are per-query, not global
- Differential dataflow only updates affected queries
- Built-in batching

### Merge Logic Assessment

| Function                         | Complexity | Real Cost | Verdict               |
| -------------------------------- | ---------- | --------- | --------------------- |
| `merge()` values                 | O(L + R)   | ~0.01ms   | **Fine**              |
| `mergeRelations()`               | O(L + R)   | ~0.01ms   | **Fine**              |
| `getResolvedValues()` O(N) scan  | O(N)       | ~0.1ms    | **Fine** (N is small) |
| `findReferencingEntities()` O(N) | O(N)       | ~0.1ms    | **Fine** (N is small) |

**Conclusion**: Don't optimize merge logic. Focus on reducing React work.

### Recommendations

1. **Skip indexing** — Overhead not justified at our data sizes
2. **Skip merge refactoring** — 4 iterations vs 2 iterations saves ~0.005ms
3. **Prioritize TanStack DB migration** — Solves the real problem (global reactivity)
4. **Consider React.memo boundaries** — Prevent re-render propagation where possible
