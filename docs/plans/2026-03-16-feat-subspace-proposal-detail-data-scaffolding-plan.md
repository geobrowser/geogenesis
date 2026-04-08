# Plan: Subspace Proposal Detail Data Scaffolding

**Created:** 2026-03-16
**Status:** Draft

## Problem Statement

The governance proposal detail view already renders a generic subspace proposal surface, but the single-proposal data path collapses REST subspace actions into coarse frontend proposal types too early. That prevents the detail page from later rendering by the specific subspace proposal kind.

Right now these raw REST action variants:

- `SUBSPACE_VERIFIED`
- `SUBSPACE_UNVERIFIED`
- `SUBSPACE_RELATED`
- `SUBSPACE_UNRELATED`
- `SUBSPACE_TOPIC_DECLARED`
- `SUBSPACE_TOPIC_REMOVED`

are normalized into only `ADD_SUBSPACE` or `REMOVE_SUBSPACE` before the detail UI sees them.

## Overview

This plan only scaffolds the data contract needed for a future Figma-driven subspace proposal detail page. It does not implement the final page design.

The goal is to preserve subtype-specific proposal data at the fetch/mapping boundary so the detail renderer can later branch on a normalized subspace proposal descriptor instead of re-parsing raw REST actions inside React components.

`ADD_SUBSPACE` and `REMOVE_SUBSPACE` should remain compatibility fields for broad renderer selection only. They should not be the canonical data source for subspace proposal detail rendering.

## Current State Analysis

### Existing Detail Flow

- `apps/web/app/space/[id]/governance/page.tsx` renders the selected proposal detail when `proposalId` is present.
- `apps/web/partials/active-proposal/active-proposal.tsx` fetches the selected proposal and switches on `proposal.type`.
- `apps/web/core/io/subgraph/fetch-proposal.ts` loads proposal detail from `GET /proposals/:id/status`.
- `apps/web/core/io/rest/schemas/proposal.ts` maps raw action types into coarse `ProposalType` values.
- `apps/web/partials/active-proposal/subspace-proposal.tsx` renders all subspace proposals through one generic add/remove path.

### Strong Local Precedents

- `apps/web/core/io/subgraph/fetch-pending-subspace-proposals.ts` already preserves subspace relation semantics for pending proposals.
- `apps/web/partials/space-page/dao-subspaces-dialog.tsx` already renders subtype-aware labels for verified vs related proposals.
- `apps/web/core/utils/contracts/governance.ts` defines the local relation vocabulary: `verified`, `related`, `subtopic`.
- `apps/web/core/hooks/use-subspace.ts` maps relation type + direction to the underlying governance action constants.

### Core Gap

`fetch-proposal` determines `proposal.type` from `actions[0]`, then discards the raw subtype-bearing action data. That means the detail page cannot later distinguish:

- verified add vs related add
- verified removal vs related removal
- topic declared vs topic removed

## Proposed Solution

Introduce a normalized subspace proposal detail shape on the single-proposal fetch path, and keep it on the shared proposal DTO.

The canonical source of truth should be REST action-derived subspace details, while coarse `proposal.type` remains available only for compatibility with existing broad rendering branches.

### Data Contract

Add a subtype-aware field for subspace proposals, separate from the existing coarse `proposal.type` compatibility field.

Recommended normalized shape:

```ts
type SubspaceProposalKind =
  | 'verified_add'
  | 'verified_remove'
  | 'related_add'
  | 'related_remove'
  | 'topic_add'
  | 'topic_remove'

type SubspaceProposalDetails = {
  kind: SubspaceProposalKind
  relationType: 'verified' | 'related' | 'subtopic'
  direction: 'add' | 'remove'
  targetSpaceId?: string
  targetTopicId?: string
  actionType: string
}
```

This should be the canonical source for future subspace detail rendering. Existing `proposal.type` can remain for compatibility while current consumers are migrated.

### Mapping Boundary

Create shared subspace-action normalization at the REST/schema boundary instead of inside UI components.

Likely touch points:

- `apps/web/core/io/rest/schemas/proposal.ts`
- `apps/web/core/io/dto/proposals.ts`
- `apps/web/core/io/subgraph/fetch-proposal.ts`

### UI Boundary

Keep `apps/web/partials/active-proposal/active-proposal.tsx` responsible only for choosing the broad proposal renderer. The subtype-specific interpretation should already be present on `proposal.subspaceDetails` (or equivalent) before `SubspaceProposal` receives the data.

### Error Handling

For malformed or unsupported subspace action payloads, fail in a way that is explicit and non-misleading:

- do not silently reclassify unknown subspace actions as generic add/remove variants
- prefer `null`/unsupported detail state plus logging over incorrect rendering
- define expected required fields per variant

## Implementation Plan

### Phase 1: Define the Normalized Contract

- Add a subtype-aware subspace proposal detail type in `apps/web/core/io/dto/proposals.ts` or an adjacent shared DTO module.
- Decide and document the canonical representation:
  - `kind` enum for rendering
  - `relationType` for shared vocabulary
  - `direction` for add/remove semantics
  - `targetSpaceId` and `targetTopicId` as subtype-specific identifiers
- Keep the current coarse `proposal.type` unchanged for now, but treat it as a compatibility layer rather than canonical subspace detail data.

### Phase 2: Add Shared Action Normalization

- Extend `apps/web/core/io/rest/schemas/proposal.ts` with a helper that converts raw action types into the normalized subspace proposal descriptor.
- Reuse the same semantic mapping already implied by `apps/web/core/hooks/use-subspace.ts` and `apps/web/core/io/subgraph/fetch-pending-subspace-proposals.ts`.
- Avoid duplicating action-to-subtype logic in multiple fetchers.

### Phase 3: Preserve Subtype Data in Single-Proposal Fetching

- Update `apps/web/core/io/subgraph/fetch-proposal.ts` to derive subspace details from the relevant raw action, not only from `actions[0]` -> `proposal.type`.
- Carry forward subtype data on the returned `Proposal` DTO.
- Define deterministic behavior if multiple actions are present:
  - either explicitly select the single supported subspace action
  - or mark the payload unsupported if the shape is ambiguous

### Phase 4: Prepare the Detail Renderer Boundary

- Update `apps/web/partials/active-proposal/subspace-proposal.tsx` props expectations so the component reads the normalized subtype scaffolding instead of needing to infer semantics itself.
- Do not implement final Figma layout yet.
- Keep current generic rendering acceptable as long as the new data is available to the component.

### Phase 5: Regression Coverage

- Add focused tests around the new normalization logic.
- Cover all six subspace variants.
- Cover malformed payloads:
  - missing `targetSpaceId` for verified/related variants
  - missing `targetTopicId` for topic variants
  - unknown action type
  - ambiguous multiple-action payload

## Technical Considerations

- Keep governance reads REST-first, consistent with `apps/web/core/io/subgraph/README.md`.
- Parse at the boundary; do not let React components decode raw action arrays.
- Reuse existing local vocabulary instead of inventing new near-duplicates.
- Topic proposal support must be included in the data contract now, even if the final UI lands later.
- If topic proposals need both a space id and topic id, capture both at the DTO layer.

## Acceptance Criteria

- `fetchProposal` returns enough structured data for consumers to distinguish all six REST subspace action variants.
- The proposal DTO preserves subtype-specific identifiers needed for later rendering.
- The canonical subtype-aware data lives outside React rendering code and is derived from REST `actionType` payloads.
- Existing broad proposal rendering does not regress while the new scaffold is added.
- Existing broad proposal rendering may continue using coarse `proposal.type`, but subspace detail rendering must not depend on `ADD_SUBSPACE` / `REMOVE_SUBSPACE` alone.
- Unknown or malformed subspace payloads do not silently masquerade as valid generic subspace proposals.
- Tests cover the normalization behavior for each supported variant and key malformed cases.

## Scope Boundaries

### In Scope

- Data contract design for subspace proposal detail scaffolding
- Shared normalization helpers for subspace action types
- Single-proposal fetch/DTO updates
- Minimal component boundary updates needed to consume the new data later
- Test coverage for normalization and mapping

### Out of Scope

- Final detail page layout or styling from Figma
- Copy/design polish for subtype-specific views
- Voting flow changes
- Proposal list redesign
- Broader refactors to unrelated proposal types

## Risks and Open Questions

- The current pipeline assumes `actions[0]` is canonical; this may not hold for every payload.
- `fetch-pending-subspace-proposals.ts` excludes topic actions today, so topic proposal behavior needs explicit normalization rather than copying that file verbatim.
- If historical proposal payloads are incomplete, the unsupported-state behavior must be defined and tested.

## References & Research

### Internal References

- `apps/web/app/space/[id]/governance/page.tsx`
- `apps/web/partials/active-proposal/active-proposal.tsx`
- `apps/web/partials/active-proposal/subspace-proposal.tsx`
- `apps/web/core/io/subgraph/fetch-proposal.ts`
- `apps/web/core/io/rest/schemas/proposal.ts`
- `apps/web/core/io/dto/proposals.ts`
- `apps/web/core/io/subgraph/fetch-pending-subspace-proposals.ts`
- `apps/web/partials/space-page/dao-subspaces-dialog.tsx`
- `apps/web/core/utils/contracts/governance.ts`
- `apps/web/core/hooks/use-subspace.ts`
- `apps/web/core/io/subgraph/README.md`

### Related Learnings

- `docs/plans/2026-02-04-feat-voting-on-proposals-plan.md` - governance UIs should avoid misleading optimistic states because indexer data lags chain confirmation.
- `docs/plans/2026-02-02-refactor-flatten-v2-directory-structure-plan.md` - verify which proposal schema boundary is authoritative when adding DTO scaffolding.

## Suggested First Implementation Slice

1. Add normalized `SubspaceProposalDetails` types.
2. Add shared action-to-subspace-details mapper.
3. Thread the new field through `fetchProposal`.
4. Add mapper tests for all six variants.
5. Leave final UI branching for the later design pass.
