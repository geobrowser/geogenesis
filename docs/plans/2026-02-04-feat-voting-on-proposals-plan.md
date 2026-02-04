# Plan: Voting on Proposals

**Created:** 2026-02-04
**Status:** Deepened
**Deepened on:** 2026-02-04

## Enhancement Summary

**Sections enhanced:** 12
**Research agents used:** best-practices-researcher (x2), architecture-strategist, security-sentinel, frontend-design skill, Context7 (TanStack Query, viem)

### Key Improvements

1. Added comprehensive error handling with contract revert parsing
2. Designed optimistic updates pattern with indexer-sync polling
3. Created accessible voting UI component with proper ARIA patterns
4. Identified security hardening requirements (address validation, proposal verification)
5. Clarified architecture boundaries between server and client components

### New Considerations Discovered

- Must handle gap between transaction confirmation and indexer update
- Client-side access control is insufficient - need on-chain verification
- Need contract address allowlist to prevent malicious contract injection
- Should NOT use optimistic updates for the vote itself - use staged feedback instead

---

## Problem Statement

The geogenesis application has UI for viewing proposals but lacks the ability to vote on them directly from the governance page. Users need to be able to:

1. View active proposals in a space's governance page
2. Cast votes (Accept/Reject) on proposals they have permission to vote on
3. See their vote status after voting
4. Execute proposals that have passed the voting threshold

The contracts protocol has changed significantly - now only DAO spaces (not personal spaces) have proposals and voting.

## Current State Analysis

### Existing Components

**Governance Page** (`apps/web/app/space/[id]/governance/page.tsx`)

- Displays proposal counts (active, accepted, rejected)
- Shows voting period and pass threshold
- Lists proposals via `GovernanceProposalsList`
- Has `ActiveProposal` slide-up panel for detailed proposal view

**Voting Infrastructure Already Exists:**

- `useVote` hook (`core/hooks/use-vote.ts`) - Uses `MainVotingAbi` from geo-sdk
- `AcceptOrReject` component (`partials/active-proposal/accept-or-reject.tsx`) - Full voting UI
- `AcceptOrRejectEditor` component (`app/home/accept-or-reject-editor.tsx`) - For editor proposals
- `AcceptOrRejectMember` component (`app/home/accept-or-reject-member.tsx`) - For membership proposals
- `Execute` component (`partials/active-proposal/execute.tsx`) - Execute passed proposals

**Data Model:**

- Proposals have types: ADD_EDIT, ADD_MEMBER, REMOVE_MEMBER, ADD_SUBSPACE, REMOVE_SUBSPACE, ADD_EDITOR, REMOVE_EDITOR
- Vote options: ACCEPT (Yes=2) or REJECT (No=3) mapped via `VoteOption` enum
- Proposals track: id, type, status, createdBy, startTime, endTime, proposalVotes

**Smart Contracts (geo-sdk):**

- `MainVotingAbi` - Full DAO voting contract with vote(), execute(), canVote(), canExecute()
- `MemberAccessAbi` - For membership-specific approve/reject
- `VoteOption` enum: None=0, Abstain=1, Yes=2, No=3

### What's Missing

1. **Voting buttons on the governance proposals list** - The list shows proposals but doesn't have inline voting
2. **Vote action from proposal detail view** - The `AcceptOrReject` component exists but may not be properly connected
3. **Proper access control** - Only editors should be able to vote on content proposals

---

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Governance Page                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Voting Period   │  │ Pass Threshold  │  │ Active Count    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Proposals List                           │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │ Proposal Card                                       │ │   │
│  │  │  - Name, Author, Status                            │ │   │
│  │  │  - Vote Progress (Yes/No bars)                     │ │   │
│  │  │  - [Vote Actions: Accept | Reject | Execute]       │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Research Insights

#### Transaction State Machine

From wagmi/viem best practices, voting transactions should follow this state machine:

```
IDLE → SIGNING → PENDING → CONFIRMING → CONFIRMED/FAILED
```

**UI Feedback by State:**
| State | Visual | Copy | Duration |
|-------|--------|------|----------|
| **Idle** | Primary button | "Vote For/Against" | - |
| **Signing** | Spinner + disabled | "Sign in wallet..." | User-dependent |
| **Pending** | Spinner + disabled | "Submitting vote..." | ~1-3s |
| **Confirming** | Progress indicator | "Waiting for confirmation..." | ~12-15s (1 block) |
| **Confirmed** | Checkmark | "Vote recorded!" | Show 3s, then update UI |
| **Failed** | Error icon | Specific error message | Until dismissed |

#### Why NOT to Use Optimistic Updates for Votes

Unlike social media likes, blockchain votes have real governance consequences:

1. **Finality matters** - A vote that appears cast but fails silently could mislead users about proposal outcomes
2. **Reorg risk** - Chain reorganizations can revert transactions
3. **Gas failures** - Transactions can fail for many reasons after submission

**Instead, use staged feedback** that clearly communicates transaction progress without showing the vote as "cast" until confirmed.

---

### Implementation Phases

#### Phase 1: Refactor Vote Hook Architecture

**Current Problem:** Vote state is split across `useState` and mutation status, violating locality of behavior.

```typescript
// Current (problematic):
const [hasApproved, setHasApproved] = useState<boolean>(false)
const [hasRejected, setHasRejected] = useState<boolean>(false)
const hasVoted = voteStatus === 'success'
// Three sources of truth!
```

**Recommended Pattern (from TanStack Query docs):**

```typescript
// Derive UI state from mutation status and variables
const { mutate, status, variables } = useMutation({
  mutationKey: ['vote', onchainProposalId],
  mutationFn: async (choice: 'ACCEPT' | 'REJECT') => { ... },
});

const isPendingAccept = status === 'pending' && variables === 'ACCEPT';
const isPendingReject = status === 'pending' && variables === 'REJECT';
const hasVoted = status === 'success';
const votedFor = status === 'success' ? variables : undefined;
```

#### Phase 2: Abstract Contract Encoding

**Current Problem:** Hook knows about ABI encoding details, violating dependency inversion.

**Create domain service:**

```typescript
// core/contracts/voting.ts
import { MainVotingAbi, VoteOption } from '@geoprotocol/geo-sdk/abis'
import { encodeFunctionData } from 'viem'

export type VoteChoice = 'ACCEPT' | 'REJECT'

export const VotingContract = {
  encodeVote(proposalId: string, choice: VoteChoice): `0x${string}` {
    return encodeFunctionData({
      abi: MainVotingAbi,
      functionName: 'vote',
      args: [
        BigInt(proposalId),
        choice === 'ACCEPT' ? VoteOption.Yes : VoteOption.No,
        true, // tryEarlyExecution
      ],
    })
  },

  encodeExecute(proposalId: string): `0x${string}` {
    return encodeFunctionData({
      abi: MainVotingAbi,
      functionName: 'execute',
      args: [BigInt(proposalId)],
    })
  },
}
```

#### Phase 3: Add Voting to Proposals List

**New Component: ProposalVoteActions**

```tsx
// partials/governance/proposal-vote-actions.tsx
interface Props {
  canVote: boolean;
  isProposalEnded: boolean;
  isProposalExecutable: boolean;
  finalStatus?: 'ACCEPTED' | 'REJECTED';
  userVote?: 'ACCEPT' | 'REJECT';
  onVote: (vote: 'ACCEPT' | 'REJECT') => void;
  onExecute: () => void;
  voteStatus: 'idle' | 'pending' | 'success' | 'error';
  compact?: boolean;
}

export function ProposalVoteActions({ ... }: Props) {
  // State machine:
  // 1. User has voted → Show confirmation badge
  // 2. Proposal executable & user can vote → Show Execute button
  // 3. Proposal ended → Show final status badge
  // 4. Active & user can vote → Show Accept/Reject buttons
  // 5. User cannot vote → Return null
}
```

**Design Specifications (from frontend-design skill):**

- Accept button: `border-green/30 text-green hover:border-green hover:bg-successTertiary`
- Reject button: `border-red-01/30 text-red-01 hover:border-red-01 hover:bg-errorTertiary`
- Confirmation badge: `bg-successTertiary text-green` or `bg-errorTertiary text-red-01`
- Minimum touch target: 48px height for mobile
- ARIA: `aria-pressed` for toggle pattern, `aria-live="polite"` for status announcements

#### Phase 4: Handle Indexer Sync Gap

**Problem:** After transaction confirms, indexer may not have updated yet.

**Solution: Polling with staged optimistic update**

```typescript
onSuccess: async ({ hash, choice }) => {
  // Keep showing "confirming" state while polling

  // Poll for indexer to catch up (with timeout)
  const synced = await pollForIndexerSync({
    proposalId: onchainProposalId,
    expectedVote: choice,
    maxAttempts: 10,
    intervalMs: 2000,
  });

  // Only invalidate after indexer has synced
  queryClient.invalidateQueries({ queryKey: ['proposal', onchainProposalId] });
  queryClient.invalidateQueries({ queryKey: ['proposals', spaceId] });
},
```

---

### Security Hardening

#### HIGH: Contract Address Validation

**Issue:** Address comes from props with no validation.

**Fix:**

```typescript
const ALLOWED_VOTING_CONTRACTS = new Set([
  '0x...', // MainVoting on Base
])

export function useVote({ address, onchainProposalId }: Args) {
  if (!isAddress(address)) {
    throw new InvalidAddressError(`Invalid address format: ${address}`)
  }

  const normalizedAddress = getAddress(address)
  if (!ALLOWED_VOTING_CONTRACTS.has(normalizedAddress)) {
    throw new UnauthorizedContractError('Unauthorized voting contract')
  }
  // ...
}
```

#### HIGH: Proposal Validation

**Issue:** No verification that proposal exists or is votable.

**Fix:** Pre-flight check before transaction:

```typescript
mutationFn: async (choice: VoteChoice) => {
  // Verify proposal state on-chain
  const canVote = await publicClient.readContract({
    address,
    abi: MainVotingAbi,
    functionName: 'canVote',
    args: [
      BigInt(onchainProposalId),
      smartAccount.address,
      choice === 'ACCEPT' ? 2 : 3,
    ],
  })

  if (!canVote) {
    throw new UnauthorizedVoteError('You are not eligible to vote')
  }

  // Proceed with vote...
}
```

#### MEDIUM: Rate Limiting

Prevent rapid repeated submissions:

```typescript
const lastVoteRef = useRef<number>(0)

mutationFn: async (choice) => {
  const now = Date.now()
  if (now - lastVoteRef.current < 5000) {
    throw new RateLimitError('Please wait before voting again')
  }
  lastVoteRef.current = now
  // ...
}
```

---

### Error Handling

#### Contract Error Parsing

```typescript
// core/utils/contract-errors.ts
const ERROR_MESSAGES: Record<string, string> = {
  VoteCastForbidden: 'You are not authorized to vote on this proposal',
  ProposalIsNotOpen: 'This proposal is no longer accepting votes',
  NotAMember: 'You must be a member of this space to perform this action',
  NotAnEditor: 'You must be an editor of this space to perform this action',
  AlreadyVoted: 'You have already voted on this proposal',
}

export function parseContractError(error: unknown): ParsedContractError {
  if (error instanceof BaseError) {
    const revertError = error.walk(
      (err) => err instanceof ContractFunctionRevertedError
    )

    if (revertError instanceof ContractFunctionRevertedError) {
      const errorName = revertError.data?.errorName ?? 'UnknownError'
      return {
        errorName,
        userMessage:
          ERROR_MESSAGES[errorName] ?? `Transaction failed: ${errorName}`,
        isRetryable: isRetryableContractError(errorName),
      }
    }
  }
  // ...
}
```

#### Transaction Error Classification

```typescript
export function classifyTransactionError(error: unknown): ClassifiedError {
  const errorString = error instanceof Error ? error.message : String(error)
  const lowerError = errorString.toLowerCase()

  if (lowerError.includes('user rejected')) {
    return {
      type: 'user-rejected',
      userMessage: 'Transaction was cancelled',
      isRetryable: true,
    }
  }
  if (lowerError.includes('insufficient funds')) {
    return {
      type: 'insufficient-funds',
      userMessage: 'Insufficient funds',
      isRetryable: false,
    }
  }
  // ... more classifications
}
```

---

### Accessibility (WCAG Compliance)

#### Voting Buttons

```tsx
<button
  onClick={onVote}
  aria-pressed={isSelected}
  aria-disabled={isDisabled}
  aria-busy={isPending}
  aria-describedby={`vote-${choice}-desc`}
  disabled={isDisabled || isPending}
>
  {choice === 'for' ? 'Accept' : 'Reject'}
</button>

<span id={`vote-${choice}-desc`} className="sr-only">
  Cast your vote {choice} this proposal
</span>
```

#### Status Announcements

```tsx
;<div role="status" aria-live="polite" className="sr-only">
  {voteState === 'signing' && 'Please sign the transaction in your wallet'}
  {voteState === 'confirming' && 'Vote submitted, waiting for confirmation'}
  {voteState === 'confirmed' && 'Your vote has been recorded on-chain'}
</div>

{
  voteState === 'failed' && (
    <div role="alert" aria-live="assertive" className="vote-error">
      {error.userMessage}
    </div>
  )
}
```

---

### Technical Details

#### Enhanced Vote Hook

```typescript
// core/hooks/use-vote.ts
export function useVote({ address, onchainProposalId, spaceId }: Args) {
  const { dispatch } = useStatusBar()
  const queryClient = useQueryClient()
  const tx = useSmartAccountTransaction({ address })

  const voteInProgressRef = useRef(false)

  return useMutation({
    mutationKey: ['vote', spaceId, onchainProposalId],
    mutationFn: async (choice: VoteChoice) => {
      if (voteInProgressRef.current) {
        throw new Error('Vote already in progress')
      }

      voteInProgressRef.current = true
      dispatch({ type: 'SET_PHASE', payload: 'awaiting-signature' })

      try {
        // Validate address and proposal (security)
        await validateVoteEligibility(address, onchainProposalId, choice)

        const calldata = VotingContract.encodeVote(onchainProposalId, choice)
        const hash = await Effect.runPromise(tx(calldata))

        if (hash) {
          dispatch({ type: 'SET_PENDING', hash })
        }
        return { hash, choice }
      } finally {
        voteInProgressRef.current = false
      }
    },

    retry: (failureCount, error) => {
      const { classification } = handleTransactionError(error)
      if (
        classification.type === 'user-rejected' ||
        !classification.isRetryable
      ) {
        return false
      }
      return failureCount < 2
    },

    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),

    onError: (error, choice) => {
      const { classification } = handleTransactionError(error)
      dispatch({
        type: 'SET_ERROR',
        error: classification,
        retry: classification.isRetryable ? () => mutate(choice) : undefined,
      })
    },

    onSuccess: async ({ hash, choice }) => {
      // Poll for indexer sync
      await pollForIndexerSync({
        proposalId: onchainProposalId,
        expectedVote: choice,
        maxAttempts: 10,
        intervalMs: 2000,
      })

      dispatch({ type: 'SET_CONFIRMED' })
      queryClient.invalidateQueries({
        queryKey: ['proposal', onchainProposalId],
      })
      queryClient.invalidateQueries({ queryKey: ['proposals', spaceId] })
    },
  })
}
```

---

### Files to Modify

1. `apps/web/core/hooks/use-vote.ts` - Refactor with proper error handling, validation
2. `apps/web/partials/governance/governance-proposals-list.tsx` - Add vote actions to cards
3. `apps/web/partials/active-proposal/accept-or-reject.tsx` - Simplify state management

### Files to Create

1. `apps/web/core/contracts/voting.ts` - Domain service for contract encoding
2. `apps/web/core/utils/contract-errors.ts` - Contract error parsing
3. `apps/web/core/utils/transaction-errors.ts` - Transaction error classification
4. `apps/web/partials/governance/proposal-vote-actions.tsx` - Inline vote component

### Proposed File Structure

```
core/
├── contracts/
│   └── voting.ts          # NEW: Calldata encoding abstraction
├── hooks/
│   ├── use-vote.ts        # MODIFY: Add validation, error handling
│   └── use-proposal.ts    # NEW: Merge server data with optimistic state
├── utils/
│   ├── contract-errors.ts # NEW: Contract error parsing
│   └── transaction-errors.ts # NEW: Transaction classification
└── state/
    └── status-bar-store.tsx # MODIFY: Enhanced transaction states

partials/
└── governance/
    ├── proposal-vote-actions.tsx # NEW: Voting UI component
    └── governance-proposals-list.tsx # MODIFY: Add vote actions
```

---

## Acceptance Criteria

- [ ] Users can vote Accept/Reject on active proposals from governance page
- [ ] Vote buttons only appear for users with permission (editors for content)
- [ ] Users can see their existing vote on proposals they've voted on
- [ ] Proposals that pass threshold can be executed
- [ ] Personal spaces don't show voting UI (no DAO governance)
- [ ] Error states are handled gracefully with user-friendly messages
- [ ] Transaction states provide clear feedback (signing → pending → confirmed)
- [ ] Contract address is validated against allowlist
- [ ] Proposal eligibility is verified on-chain before vote
- [ ] UI is accessible (keyboard navigation, screen reader support)
- [ ] Mobile responsive with appropriate touch targets

---

## Open Questions (Answered)

1. **Should we add voting inline on the proposals list or only in the detail view?**
   → **Both.** Compact inline buttons on list, full buttons in detail view.

2. **How should we handle the case where a user votes but the transaction fails?**
   → Use staged feedback (not optimistic). Show clear error with retry option if retryable.

3. **Do we need to add polling/websockets to update vote counts in real-time?**
   → Poll after vote success to sync with indexer. Consider websockets for future enhancement.

4. **Should we pre-check `canVote()` on-chain before showing vote buttons?**
   → Yes, call `canVote()` before submitting transaction as a security measure.

---

## Dependencies

- `@geoprotocol/geo-sdk` - ABIs and VoteOption enum (already installed)
- `@tanstack/react-query` - Mutations and cache (already installed)
- `viem` - encodeFunctionData, error parsing (already installed)
- Smart account (AA wallet) for transaction execution (existing infrastructure)
- Subgraph indexer for vote state updates (existing infrastructure)

---

## References

- [TanStack Query - Optimistic Updates](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- [viem - encodeFunctionData](https://viem.sh/docs/contract/encodeFunctionData)
- [W3C APG - Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
- [wagmi - useMutation patterns](https://wagmi.sh/react/guides/mutations)
