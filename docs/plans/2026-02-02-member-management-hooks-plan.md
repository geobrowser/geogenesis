# Member Management Hooks Implementation Plan

**Date:** 2026-02-02  
**Brainstorm:** `docs/brainstorms/2026-02-02-member-management-hooks-brainstorm.md`

## Overview

Implement 4 React hooks for DAO space member management that route through `SpaceRegistry.enter()`:

1. `useProposeAddMember`
2. `useProposeRemoveMember`
3. `useProposeAddEditor`
4. `useProposeRemoveEditor`

## Implementation Tasks

### Phase 1: ABI Updates

**Task 1.1: Extend DAOSpaceAbi**

File: `apps/web/core/utils/contracts/space-registry.ts`

Add `removeMember` and `removeEditor` function definitions to `DAOSpaceAbi`:

```typescript
// Add to DAOSpaceAbi array:
{
  inputs: [{ internalType: 'bytes16', name: '_memberSpaceId', type: 'bytes16' }],
  name: 'removeMember',
  outputs: [],
  stateMutability: 'nonpayable',
  type: 'function',
},
{
  inputs: [{ internalType: 'bytes16', name: '_editorSpaceId', type: 'bytes16' }],
  name: 'removeEditor',
  outputs: [],
  stateMutability: 'nonpayable',
  type: 'function',
},
```

---

### Phase 2: Create New Hooks

All hooks follow the pattern established in `use-request-to-be-editor.ts`:

- Use `useMutation` from TanStack Query
- Use `Effect.gen` for async operations
- Use `useSmartAccountTransaction` for transaction execution
- Generate proposal IDs using `IdUtils.generate()` from `@geoprotocol/geo-sdk`
- Route through `SpaceRegistry.enter()` with `GOVERNANCE_ACTIONS.PROPOSAL_CREATED`

**Error Handling Pattern:**

- Use `useStatusBar` for user-facing errors with `dispatch({ type: 'ERROR', payload, retry })`
- Use `Effect.either` with `Either.match` for structured error handling
- Include retry callbacks where appropriate
- Validate inputs early: `smartAccount`, `personalSpaceId`, `spaceId`, `space?.address`

---

**Task 2.1: Create `use-propose-add-member.ts`**

File: `apps/web/core/hooks/use-propose-add-member.ts`

**Interface:**

```typescript
interface UseProposeAddMemberArgs {
  /** Target DAO space ID (bytes16 hex without 0x prefix) */
  spaceId: string | null
  /** Voting mode: 'fast' or 'slow' */
  votingMode?: 'fast' | 'slow'
}
```

**Behavior:**

- Encodes `DAOSpace.addMember(targetMemberSpaceId)` as the proposal action
- Supports both fast and slow voting modes (default: slow)
- Returns `{ proposeAddMember: (targetMemberSpaceId: string) => void, status }`

**Key Implementation Details:**

1. Get caller's personal space ID via `usePersonalSpaceId()`
2. Get target space address via `useSpace(spaceId)`
3. Generate proposal ID: `0x${IdUtils.generate()}`
4. Encode inner action: `encodeFunctionData({ functionName: 'addMember', abi: DAOSpaceAbi, args: [targetMemberSpaceId] })`
5. Encode proposal data: `encodeProposalCreatedData(proposalId, votingMode, [{ to: spaceAddress, value: 0n, data: addMemberCallData }])`
6. Encode outer call: `encodeFunctionData({ functionName: 'enter', abi: SpaceRegistryAbi, args: [...] })`
7. Execute via `useSmartAccountTransaction`

---

**Task 2.2: Create `use-propose-remove-member.ts`**

File: `apps/web/core/hooks/use-propose-remove-member.ts`

**Interface:**

```typescript
interface UseProposeRemoveMemberArgs {
  /** Target DAO space ID (bytes16 hex without 0x prefix) */
  spaceId: string | null
  /** Voting mode: 'fast' or 'slow' */
  votingMode?: 'fast' | 'slow'
}
```

**Behavior:**

- Encodes `DAOSpace.removeMember(targetMemberSpaceId)` as the proposal action
- Supports both fast and slow voting modes (default: slow)
- Returns `{ proposeRemoveMember: (targetMemberSpaceId: string) => void, status }`

**Implementation:** Same pattern as Task 2.1, but uses `removeMember` function.

---

**Task 2.3: Create `use-propose-add-editor.ts`**

File: `apps/web/core/hooks/use-propose-add-editor.ts`

**Interface:**

```typescript
interface UseProposeAddEditorArgs {
  /** Target DAO space ID (bytes16 hex without 0x prefix) */
  spaceId: string | null
}
```

**Behavior:**

- Encodes `DAOSpace.addEditor(targetEditorSpaceId)` as the proposal action
- **SLOW PATH ONLY** - no `votingMode` parameter; always uses `VOTING_MODE.SLOW`
- Returns `{ proposeAddEditor: (targetEditorSpaceId: string) => void, status }`

**Constraint:** `addEditor` is NOT in the fast path whitelist. The hook must enforce slow path only.

---

**Task 2.4: Create `use-propose-remove-editor.ts`**

File: `apps/web/core/hooks/use-propose-remove-editor.ts`

**Interface:**

```typescript
interface UseProposeRemoveEditorArgs {
  /** Target DAO space ID (bytes16 hex without 0x prefix) */
  spaceId: string | null
}
```

**Behavior:**

- Encodes `DAOSpace.removeEditor(targetEditorSpaceId)` as the proposal action
- **SLOW PATH ONLY** - no `votingMode` parameter; always uses `VOTING_MODE.SLOW`
- Returns `{ proposeRemoveEditor: (targetEditorSpaceId: string) => void, status }`

**Constraint:** `removeEditor` is NOT in the fast path whitelist. The hook must enforce slow path only.

---

### Phase 3: Update Consumers

**Task 3.1: Update `space-members-manage-dialog-content.tsx`**

File: `apps/web/partials/space-page/space-members-manage-dialog-content.tsx`

**Current State:**

- Uses `useAddMember` with `pluginAddress` parameter (personal space pattern)
- Uses `useRemoveMember` with `votingPluginAddress` and `spaceType` parameters
- Conditionally renders add UI only for `PERSONAL` space type (line 52)
- Passes wallet addresses to mutations (`memberToAdd`, `member.address`)

**Required Changes:**

1. **Import changes:**

   ```typescript
   // Remove:
   import { useAddMember } from '../../core/hooks/use-add-member'
   import { useRemoveMember } from '../../core/hooks/use-remove-member'

   // Add:
   import { useProposeAddMember } from '../../core/hooks/use-propose-add-member'
   import { useProposeRemoveMember } from '../../core/hooks/use-propose-remove-member'
   ```

2. **Props interface changes:**
   - Replace `votingPluginAddress` with `spaceId` (the DAO space ID)
   - Keep `spaceType` for conditional rendering logic
   - May need to add member space IDs to the `Member` type or fetch them

3. **Hook usage changes:**
   - New hooks take `spaceId` instead of `pluginAddress`
   - Mutations now take `targetMemberSpaceId` (bytes16) instead of wallet address
   - This is a **breaking change** in the mutation parameter type

4. **UI logic consideration:**
   - Current UI passes wallet addresses; new hooks require space IDs
   - Either:
     a. Update Member type to include `spaceId` field, OR
     b. Create a lookup mechanism from wallet address to space ID
   - **Decision needed:** How to resolve wallet address → space ID mapping

---

**Task 3.2: Update `space-editors-manage-dialog-content.tsx`**

File: `apps/web/partials/space-page/space-editors-manage-dialog-content.tsx`

**Current State:**

- Uses `useAddEditor` with `pluginAddress` parameter (personal space pattern)
- Uses `useRemoveEditor` with `votingPluginAddress` and `spaceType` parameters
- Conditionally renders add UI only for `PERSONAL` space type (line 49)
- Passes wallet addresses to mutations

**Required Changes:**

1. **Import changes:**

   ```typescript
   // Remove:
   import { useAddEditor } from '../../core/hooks/use-add-editor'
   import { useRemoveEditor } from '../../core/hooks/use-remove-editor'

   // Add:
   import { useProposeAddEditor } from '../../core/hooks/use-propose-add-editor'
   import { useProposeRemoveEditor } from '../../core/hooks/use-propose-remove-editor'
   ```

2. **Props interface changes:**
   - Replace `votingPluginAddress` with `spaceId`
   - Keep `spaceType` for conditional rendering

3. **Hook usage changes:**
   - Same pattern as Task 3.1

4. **Same UI logic consideration** as Task 3.1 regarding address → space ID mapping

---

### Phase 4: Delete Old Hooks

**Task 4.1: Remove deprecated hook files**

Delete the following files after consumer updates are complete:

- `apps/web/core/hooks/use-add-member.ts`
- `apps/web/core/hooks/use-remove-member.ts`
- `apps/web/core/hooks/use-add-editor.ts`
- `apps/web/core/hooks/use-remove-editor.ts`

**Note:** These hooks are safe to delete - personal spaces do not have members/editors, so these hooks are effectively unused.

---

## Resolved Questions

### Q1: Wallet Address to Space ID Mapping

**Resolution:** Space IDs are already available in the member/editor data model. The hooks will accept space IDs directly - no additional data fetching or lookup mechanisms needed.

### Q2: Personal Space Support

**Resolution:** There is no concept of members/editors in personal spaces. The old hooks are effectively unused and will be deleted entirely. No replacement or routing wrapper needed.

---

## File Change Summary

| File                                                          | Action | Description                                         |
| ------------------------------------------------------------- | ------ | --------------------------------------------------- |
| `core/utils/contracts/space-registry.ts`                      | Modify | Add `removeMember`, `removeEditor` to `DAOSpaceAbi` |
| `core/hooks/use-propose-add-member.ts`                        | Create | New hook for DAO member addition proposals          |
| `core/hooks/use-propose-remove-member.ts`                     | Create | New hook for DAO member removal proposals           |
| `core/hooks/use-propose-add-editor.ts`                        | Create | New hook for DAO editor addition proposals          |
| `core/hooks/use-propose-remove-editor.ts`                     | Create | New hook for DAO editor removal proposals           |
| `partials/space-page/space-members-manage-dialog-content.tsx` | Modify | Update to use new hooks for DAO spaces              |
| `partials/space-page/space-editors-manage-dialog-content.tsx` | Modify | Update to use new hooks for DAO spaces              |
| `core/hooks/use-add-member.ts`                                | Delete | After migration complete                            |
| `core/hooks/use-remove-member.ts`                             | Delete | After migration complete                            |
| `core/hooks/use-add-editor.ts`                                | Delete | After migration complete                            |
| `core/hooks/use-remove-editor.ts`                             | Delete | After migration complete                            |

---

## Testing Considerations

### Unit Testing

1. **ABI encoding tests** - Verify calldata matches expected format for each action
2. **Voting mode validation** - Ensure editor hooks reject fast path attempts
3. **Input validation** - Test null/invalid space IDs, missing personal space

### Integration Testing

1. **Transaction flow** - Verify transactions reach `SpaceRegistry.enter()` correctly
2. **Proposal creation** - Confirm proposals appear in substream/indexer
3. **Error handling** - Test wallet disconnection, network errors, contract reverts

### Manual Testing Scenarios

1. **Add member to DAO space (slow path)**
2. **Add member to DAO space (fast path)**
3. **Remove member from DAO space (both paths)**
4. **Add editor to DAO space (slow path only)**
5. **Remove editor from DAO space (slow path only)**
6. **Error case: Fast path for editor actions should fail client-side**
7. **Error case: User without personal space ID**

---

## Implementation Order

1. **Task 1.1** - ABI updates (dependency for all hooks) ✅ COMPLETE
2. **Tasks 2.1-2.4** - Create new hooks (can be parallelized) ✅ COMPLETE
3. **Tasks 3.1-3.2** - Update consumers (depends on hooks + address resolution decision) ⏸️ DEFERRED
4. **Task 4.1** - Delete old hooks (after consumers verified working) ⏸️ DEFERRED

### Implementation Status

**Completed:**

- Extended `DAOSpaceAbi` with `removeMember` and `removeEditor`
- Created 4 new hooks:
  - `use-propose-add-member.ts`
  - `use-propose-remove-member.ts`
  - `use-propose-add-editor.ts`
  - `use-propose-remove-editor.ts`

**Deferred:**

- Consumer updates require passing space IDs through the component tree
- Current data flow discards space IDs after fetching profiles
- This is a UI concern that should be addressed when the UI is ready to use the new hooks

---

## Dependencies

- `@geoprotocol/geo-sdk` - For `IdUtils.generate()`
- `@tanstack/react-query` - For `useMutation`
- `effect` - For `Effect.gen`, `Either`
- `viem` - For `encodeFunctionData`, `Hex` types

All dependencies are already used in the codebase.
