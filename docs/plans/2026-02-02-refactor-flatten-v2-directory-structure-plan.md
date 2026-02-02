---
title: 'refactor: Flatten v2 Directory Structure'
type: refactor
date: 2026-02-02
---

# refactor: Flatten v2 Directory Structure

## Overview

Remove the `v2/` directory nesting in `apps/web/core/io/v2/` and rename `v2.types.ts` to `types.ts`. This cleanup follows the completion of the GRC-20 v2 migration, where the legacy data model is no longer used. The goal is to simplify the codebase structure and remove versioned naming that no longer serves a purpose.

## Problem Statement / Motivation

The `v2/` directory structure was created during the GRC-20 v2 migration to support both legacy and new data models simultaneously. Now that:

- The legacy data model is deprecated
- The v2 API is the primary data source
- The migration is complete

...the `v2` prefix and nesting creates unnecessary cognitive overhead and doesn't accurately reflect the current state of the codebase.

## Current State Analysis

### Files to Flatten

| Current Location           | Purpose                                             | Importers          |
| -------------------------- | --------------------------------------------------- | ------------------ |
| `io/v2/v2.schema.ts`       | Effect schemas for v2 API validation                | 7 files            |
| `io/v2/graphql.ts`         | GraphQL client wrapper                              | Used by queries.ts |
| `io/v2/fragments.tsx`      | GraphQL typed document nodes                        | Used by queries.ts |
| `io/v2/queries.ts`         | Query functions (getBatchEntities, getEntity, etc.) | 15 files           |
| `io/v2/converters.ts`      | WhereCondition to EntityFilter converters           | 2 files            |
| `io/v2/converters.test.ts` | Tests for converters                                | N/A                |
| `io/v2/decoders/`          | Schema decoders (5 files)                           | Used by queries.ts |

### Files to Rename

| Current Location   | Purpose                                                | Importers |
| ------------------ | ------------------------------------------------------ | --------- |
| `core/v2.types.ts` | GRC-20 v2 domain types (Entity, Relation, Value, etc.) | 94+ files |

### Files to Audit for Potential Removal

| File            | Purpose                                      | Importers | Analysis                                                                 |
| --------------- | -------------------------------------------- | --------- | ------------------------------------------------------------------------ |
| `io/schema.ts`  | Legacy Substream schemas                     | 14 files  | Contains branded types (EntityId, SpaceId) still in use + legacy schemas |
| `core/types.ts` | App utility types (Profile, SpaceType, etc.) | 17 files  | No overlap with v2.types.ts, should be kept                              |

## Technical Considerations

### Naming Conflicts to Resolve

1. **`schema.ts` conflict**
   - `io/schema.ts` exists (527 lines of legacy Substream schemas)
   - `v2/v2.schema.ts` exists (157 lines of v2 API schemas)
   - **Decision needed**: Audit `io/schema.ts` usage and determine if it can be deprecated

2. **`graphql.ts` conflict**
   - `subgraph/graphql.ts` exists (Effect-based fetch wrapper)
   - `v2/graphql.ts` exists (graphql-request based client)
   - **Resolution**: Different implementations for different APIs, keep both with clear naming

3. **`fragments.ts` vs `fragments.tsx` conflict**
   - `subgraph/fragments.ts` exists (template literal fragments)
   - `v2/fragments.tsx` exists (typed document nodes)
   - **Resolution**: Different content, keep both with clear naming

### SpaceGovernanceType Discrepancy

```typescript
// io/schema.ts (legacy)
type SpaceGovernanceType = 'PUBLIC' | 'PERSONAL'

// core/types.ts
type SpaceGovernanceType = 'PUBLIC' | 'PERSONAL'

// io/v2/v2.schema.ts (v2 API)
type SpaceGovernanceType = 'DAO' | 'PERSONAL'
```

The v2 API uses `'DAO'` instead of `'PUBLIC'`. A mapping function already exists in `dto/spaces.ts`:

```typescript
// @TODO(grc-20-v2-migration): Update app to use 'DAO' | 'PERSONAL' and remove this mapping
```

This should be addressed as part of this refactor.

### Import Path Changes Required

| Old Import                | New Import                                   | Files Affected  |
| ------------------------- | -------------------------------------------- | --------------- |
| `~/core/io/v2/queries`    | `~/core/io/queries`                          | 15 files        |
| `~/core/io/v2/converters` | `~/core/io/converters`                       | 2 files         |
| `~/core/io/v2/v2.schema`  | `~/core/io/schema` or `~/core/io/api-schema` | 1 file          |
| `../v2/v2.schema`         | `../schema` or `../api-schema`               | 6 dto files     |
| `../v2.schema`            | `./schema` or `./api-schema`                 | 5 decoder files |
| `~/core/v2.types`         | `~/core/types`                               | 94+ files       |

## Proposed Solution

### Phase 1: Audit Legacy Files

1. **Audit `io/schema.ts`**
   - Identify which exports are still used:
     - `EntityId`, `SpaceId` branded types (14 usages)
     - `SubstreamVersionHistorical` (2 usages)
     - `SubstreamProposal` (1 usage)
   - **Options**:
     a) Keep as `substream-schema.ts` for historical/version queries
     b) Move used branded types to a shared location, deprecate rest
     c) Keep as-is if still actively used for subgraph queries

2. **Audit `core/types.ts`**
   - Confirm no overlap with `v2.types.ts`
   - Contains: `Profile`, `SpaceType`, `SpaceGovernanceType`, `ReviewState`, `TabEntity`
   - **Recommendation**: Keep separate, these are distinct from domain types

### Phase 2: Flatten v2 Directory

**Move files from `io/v2/` to `io/`:**

```
io/v2/v2.schema.ts    → io/schema.ts (rename legacy to substream-schema.ts first)
                    OR → io/api-schema.ts (if keeping legacy schema.ts)
io/v2/graphql.ts      → io/graphql-client.ts (avoid conflict with subgraph/graphql.ts)
io/v2/fragments.tsx   → io/query-fragments.tsx (avoid conflict, clarify purpose)
io/v2/queries.ts      → io/queries.ts
io/v2/converters.ts   → io/converters.ts
io/v2/converters.test.ts → io/converters.test.ts
io/v2/decoders/       → io/decoders/
```

### Phase 3: Rename Types File

```
core/v2.types.ts → core/types.ts
```

Merge with existing `core/types.ts` content (40 lines) since there's no overlap.

### Phase 4: Update SpaceGovernanceType

Update the app to use `'DAO' | 'PERSONAL'` consistently:

1. Remove the mapping function in `dto/spaces.ts`
2. Update all usages of `'PUBLIC'` to `'DAO'`
3. Update `core/types.ts` definition

### Phase 5: Update All Imports

Use IDE refactoring or find-and-replace to update all import paths.

## Acceptance Criteria

### Functional Requirements

- [ ] All v2/ files moved to io/ level
- [ ] `core/v2.types.ts` renamed to `core/types.ts`
- [ ] All import paths updated across the codebase
- [ ] No TypeScript compilation errors
- [ ] No runtime errors

### Non-Functional Requirements

- [ ] No behavior changes (pure refactoring)
- [ ] Test suite passes (including `converters.test.ts`)
- [ ] Build completes successfully

### Quality Gates

- [ ] TypeScript strict mode passes
- [ ] ESLint passes (may need import ordering fixes)
- [ ] All existing tests pass

## Implementation Steps

### Step 1: Audit io/schema.ts

```bash
# Check all usages
grep -r "from '~/core/io/schema" apps/web --include="*.ts" --include="*.tsx"
```

**Files using io/schema.ts:**

- `utils/utils.ts` - EntityId
- `utils/entity/entities.ts` - EntityId
- `utils/contracts/generate-ops-for-space-type.ts` - EntityId
- `utils/change/fetch-previous-version-by-created-at.ts` - SubstreamVersionHistorical
- `utils/change/fetch-versions-by-edit-id.ts` - SubstreamVersionHistorical
- `utils/change/change.test.ts` - EntityId
- `state/editor/block-types.ts` - EntityId
- `io/fetch-parent-entity-id.ts` - EntityId
- `hooks/use-place-search.ts` - EntityId
- `hooks/use-deploy-space.ts` - EntityId
- `blocks/data/use-source.ts` - EntityId, SpaceId
- `blocks/data/use-view.ts` - EntityId
- `blocks/data/initialize.ts` - EntityId
- `app/home/fetch-active-proposals-in-editor-spaces.ts` - SubstreamProposal

### Step 2: Decision - Schema File Strategy

**Recommended approach:**

1. Rename `io/schema.ts` → `io/substream-schema.ts`
2. Rename `io/v2/v2.schema.ts` → `io/schema.ts`
3. Update 14 imports from old schema location
4. Update 7 imports from v2.schema location

### Step 3: Move Files

```bash
# Create backup branch
git checkout -b refactor/flatten-v2-backup

# Rename legacy schema first
git mv apps/web/core/io/schema.ts apps/web/core/io/substream-schema.ts

# Move v2 files
git mv apps/web/core/io/v2/v2.schema.ts apps/web/core/io/schema.ts
git mv apps/web/core/io/v2/graphql.ts apps/web/core/io/graphql-client.ts
git mv apps/web/core/io/v2/fragments.tsx apps/web/core/io/query-fragments.tsx
git mv apps/web/core/io/v2/queries.ts apps/web/core/io/queries.ts
git mv apps/web/core/io/v2/converters.ts apps/web/core/io/converters.ts
git mv apps/web/core/io/v2/converters.test.ts apps/web/core/io/converters.test.ts
git mv apps/web/core/io/v2/decoders apps/web/core/io/decoders

# Remove empty v2 directory
rmdir apps/web/core/io/v2
```

### Step 4: Merge Types Files

```bash
# Merge v2.types.ts into types.ts
# v2.types.ts has domain types (Entity, Relation, Value, etc.)
# types.ts has utility types (Profile, SpaceType, ReviewState, etc.)
# No overlap - can be combined

# Prepend types.ts content to v2.types.ts, then rename
git mv apps/web/core/v2.types.ts apps/web/core/domain-types.ts.tmp
cat apps/web/core/types.ts apps/web/core/domain-types.ts.tmp > apps/web/core/types.ts.new
mv apps/web/core/types.ts.new apps/web/core/types.ts
rm apps/web/core/domain-types.ts.tmp
```

### Step 5: Update Internal Imports

Update imports within io/ directory:

```typescript
// io/queries.ts
- import { Entity, SearchResult } from '~/core/v2.types';
+ import { Entity, SearchResult } from '~/core/types';

- import { SpaceDecoder } from './decoders/space';
+ import { SpaceDecoder } from './decoders/space';  // no change needed

// io/decoders/*.ts files
- import { Entity as EntitySchema } from '../v2.schema';
+ import { Entity as EntitySchema } from '../schema';

// io/dto/*.ts files
- import { RemoteEntity } from '../v2/v2.schema';
+ import { RemoteEntity } from '../schema';
```

### Step 6: Update External Imports

Use find-and-replace across codebase:

```bash
# Update v2.types imports (94+ files)
find apps/web -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' "s|from '~/core/v2.types'|from '~/core/types'|g" {} +

# Update v2/queries imports (15 files)
find apps/web -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' "s|from '~/core/io/v2/queries'|from '~/core/io/queries'|g" {} +

# Update v2/converters imports (2 files)
find apps/web -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' "s|from '~/core/io/v2/converters'|from '~/core/io/converters'|g" {} +

# Update legacy schema imports (14 files)
find apps/web -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' "s|from '~/core/io/schema'|from '~/core/io/substream-schema'|g" {} +
```

### Step 7: Update SpaceGovernanceType

1. In `core/types.ts`, change:

```typescript
- export type SpaceGovernanceType = 'PUBLIC' | 'PERSONAL';
+ export type SpaceGovernanceType = 'DAO' | 'PERSONAL';
```

2. In `dto/spaces.ts`, remove the mapping:

```typescript
- // @TODO(grc-20-v2-migration): Update app to use 'DAO' | 'PERSONAL' and remove this mapping
- const GOVERNANCE_TYPE_MAP: Record<'DAO' | 'PERSONAL', SpaceGovernanceType> = {
-   DAO: 'PUBLIC',
-   PERSONAL: 'PERSONAL',
- };
```

3. Update any UI code that checks for `'PUBLIC'` to use `'DAO'`

### Step 8: Verify

```bash
# TypeScript compilation
pnpm tsc --noEmit

# Run tests
pnpm test

# Build
pnpm build
```

## File Mapping Summary

| Current Path               | New Path                 |
| -------------------------- | ------------------------ |
| `io/schema.ts`             | `io/substream-schema.ts` |
| `io/v2/v2.schema.ts`       | `io/schema.ts`           |
| `io/v2/graphql.ts`         | `io/graphql-client.ts`   |
| `io/v2/fragments.tsx`      | `io/query-fragments.tsx` |
| `io/v2/queries.ts`         | `io/queries.ts`          |
| `io/v2/converters.ts`      | `io/converters.ts`       |
| `io/v2/converters.test.ts` | `io/converters.test.ts`  |
| `io/v2/decoders/`          | `io/decoders/`           |
| `core/v2.types.ts`         | `core/types.ts` (merged) |

## Import Update Summary

| Old Import                | New Import                   | Count                       |
| ------------------------- | ---------------------------- | --------------------------- |
| `~/core/v2.types`         | `~/core/types`               | 94+                         |
| `~/core/io/v2/queries`    | `~/core/io/queries`          | 15                          |
| `~/core/io/v2/converters` | `~/core/io/converters`       | 2                           |
| `~/core/io/v2/v2.schema`  | `~/core/io/schema`           | 1                           |
| `../v2/v2.schema`         | `../schema`                  | 6                           |
| `../v2.schema`            | `../schema`                  | 5                           |
| `~/core/io/schema`        | `~/core/io/substream-schema` | 14                          |
| `~/core/types`            | `~/core/types`               | 17 (no change, merged file) |

## Risk Analysis & Mitigation

| Risk                                   | Likelihood | Impact | Mitigation                                              |
| -------------------------------------- | ---------- | ------ | ------------------------------------------------------- |
| Missed import update                   | Medium     | Low    | TypeScript will catch at compile time                   |
| Circular dependency introduced         | Low        | High   | Run build verification after each step                  |
| Runtime behavior change                | Low        | High   | Pure refactoring, no logic changes; run full test suite |
| Merge conflicts for in-flight branches | High       | Medium | Communicate to team, provide migration guide            |

## Future Considerations

After this refactor:

1. Consider consolidating `subgraph/` directory if it's only used for historical queries
2. Add barrel exports (`index.ts`) for cleaner imports: `import { getEntity } from '~/core/io'`
3. Review if `substream-schema.ts` can be fully deprecated

## References

### Internal References

- `apps/web/core/io/v2/` - Current v2 directory structure
- `apps/web/core/v2.types.ts` - Current domain types file
- `apps/web/core/io/dto/spaces.ts:20` - SpaceGovernanceType mapping TODO

### Related Work

- GRC-20 v2 migration (completed)
