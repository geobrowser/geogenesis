# Plan: Subtopics Space Usage Display

**Created:** 2026-03-17
**Status:** Draft

## Overview

The subtopics dialog currently splits its data model in a way that is useful for adding a subtopic, but too thin for rendering the current subtopics list.

- `useSearch()` already fetches entities by name and exposes `result.spaces`, which is enough to show how many spaces use a candidate topic while searching.
- `useSubtopics(spaceId)` currently returns only `{ id, name }`, so the current subtopics list cannot show which spaces use that topic or render the avatar-group treatment the product needs.

This plan keeps the existing entity-name search behavior for the add flow while expanding the current subtopics fetch so each listed subtopic also carries the spaces that reference that entity as their topic.

## Problem Statement

`apps/web/partials/space-page/subtopics-dialog.tsx` renders two related but inconsistent surfaces:

- the add-subtopic search results already show `result.spaces.length`
- the current subtopics list only shows the topic name plus a remove button

That mismatch comes from the fetch boundary:

- `apps/web/core/hooks/use-search.ts` returns rich entity search results with `spaces`
- `apps/web/core/io/subgraph/fetch-subtopics.ts` drops the related-space information and returns only topic id/name

The result is that the dialog cannot render the intended avatar group and usage count for the current subtopics list without re-deriving data in React or making an ad hoc follow-up join.

## Current State Analysis

### Existing Data Paths

- `apps/web/partials/space-page/subtopics-dialog.tsx` uses `useSearch()` for search results and `useSubtopics(spaceId)` for the current list.
- `apps/web/core/io/subgraph/fetch-subtopics.ts` reads `subspaceTopicsConnection(filter: { spaceId })` and maps nodes to `{ id, name }`.
- `apps/web/core/hooks/use-search.ts` sorts and returns search results whose `spaces` field is already consumed elsewhere in the UI.
- `apps/web/design-system/find-entity.tsx` already renders small stacked space images and a space count from `result.spaces`.

### Strong Local Precedents

- `apps/web/design-system/avatar-group.tsx` provides the avatar stacking primitive.
- `apps/web/partials/space-page/space-members-chip.tsx` shows the preferred “avatar group + count label” composition.
- `apps/web/core/hooks/use-spaces-by-ids.ts` exists if the subtopics path must resolve full space records from ids as a second step.
- `apps/web/partials/active-proposal/subspace-proposal.tsx` already fetches associated spaces from a topic id, which is a useful fallback precedent if the subgraph cannot return everything in one query.

### Core Gap

The current subtopics DTO is too lossy. By the time the dialog renders, it no longer knows:

- which spaces use a given topic entity
- how many unique spaces should count toward the badge
- which space images should populate the avatar group

## Proposed Solution

Preserve the richer topic-to-space relationship at the fetch boundary for current subtopics, and render that richer shape directly in the dialog.

### Data Contract

Replace the current minimal subtopic DTO with a shape that keeps the topic entity plus the consuming spaces.

Recommended shape:

```ts
type SubtopicUsageSpace = {
  id: string
  name: string
  image: string
}

type SubtopicWithSpaces = {
  id: string
  name: string
  spaces: SubtopicUsageSpace[]
  spacesCount: number
}
```

Rules:

- `spaces` should be deduped by space id before rendering
- `spacesCount` should reflect the full deduped count, even if the UI only shows the first few avatars
- the count should include the current space if it uses the topic
- missing names/images should fall back safely to existing placeholder behavior

### Fetch Strategy

Use a single enriched subgraph query inside `fetchSubtopics`.

Verified from local codegen and remote introspection against `https://testnet-api.geobrowser.io/graphql`:

- `SubspaceTopic` exposes both `topic` and `space`
- `Entity` exposes `spacesByTopicId`
- `Entity` does not expose a direct `image` field in this schema
- `Space` does not expose a direct `entity.image` field in this schema, but it does expose `page` and relation data that existing subgraph fetches already use to derive a renderable image
- the local DTO layer mirrors this split: base `Entity` from `apps/web/core/io/dto/entities.ts` does not add `image`, while `SpaceEntity` in `apps/web/core/io/dto/spaces.ts` derives `image` from avatar/cover relations

That means the intended shape must come from one query that starts at the current space's `subspaceTopicsConnection`, joins to `topic`, and from there joins to the spaces using that topic id. The `topic` join is required, not optional:

- `subspaceTopicsConnection.nodes` gives us `topicId`, but not enough topic metadata to render the row cleanly
- `topic.name` is the canonical name source for the row
- `topic.spacesByTopicId` is the relation we need to enumerate the spaces using that topic

Space imagery should be derived from the joined space/page relation data, following the same pattern already used in `apps/web/core/io/subgraph/fetch-active-subspaces.ts`.

Representative query shape:

```graphql
subspaceTopicsConnection(filter: { spaceId: { is: $spaceId } }) {
  nodes {
    topicId
    topic {
      name
      spacesByTopicId {
        id
        topicId
        page {
          name
          relationsList(...) { ... }
        }
      }
    }
  }
}
```

The key design point is that `fetchSubtopics` remains the canonical boundary that returns `SubtopicWithSpaces[]`; React should not perform a follow-up join.

### UI Rendering Boundary

Update the current subtopics section in `apps/web/partials/space-page/subtopics-dialog.tsx` so each row shows:

- topic name
- avatar group of the first few consuming spaces
- text count of total spaces using that topic
- existing remove action

The add-subtopic search should remain entity-name based and continue showing space usage for search results, reusing current behavior.

## Implementation Plan

### Phase 1: Redefine the Subtopics DTO

- Update `apps/web/core/io/subgraph/fetch-subtopics.ts` to return a richer `SubtopicWithSpaces` shape.
- Decide whether `spacesCount` is derived at render time or stored on the DTO.
- Ensure duplicate topic ids and duplicate space ids are normalized before returning data to React.

### Phase 2: Fetch Space Usage for Current Subtopics

- Expand `apps/web/core/io/subgraph/fetch-subtopics.ts` to query:
  - the current space's declared subtopics
  - each joined `topic` record
  - each joined topic's `name`
  - each joined topic's `spacesByTopicId`
  - enough joined space/page relation data to resolve an avatar image in the fetcher
- Reuse the existing relation-to-image resolution pattern from `apps/web/core/io/subgraph/fetch-active-subspaces.ts` instead of introducing a second query or a UI-side resolver.
- Normalize the response so each topic row has deduped consuming spaces and a stable count.

### Phase 3: Update the Dialog Row UI

- Add an avatar-group/count display to each current subtopic row in `apps/web/partials/space-page/subtopics-dialog.tsx`.
- Reuse `AvatarGroup` and `Avatar` or the existing small stacked image treatment, depending on which integrates cleanly with space image data.
- Limit the visible avatars to a small fixed number and show the full usage through the count text.
- Keep loading, empty, and error states intact.

### Phase 4: Mutation and Cache Consistency

- After add/remove subtopic mutations, invalidate the enriched `['subtopics', spaceId]` query as today.
- Ensure the refreshed data shape updates both name and usage metadata without requiring local optimistic stitching.
- Confirm dialog-close behavior does not leave in-flight secondary fetches unresolved if the composed-query fallback is used.

### Phase 5: Regression Coverage

- Add focused coverage around the data-mapping boundary for:
  - deduped space usage
  - missing space images/names
  - topic rows with zero spaces
  - duplicate topic rows returned by the backend
- Add a UI-level test if this dialog already has a practical test harness; otherwise prioritize mapper coverage first.

## Technical Considerations

- Keep “parse at the boundary” as the main design rule. The dialog should receive render-ready subtopic rows instead of performing its own graph joins.
- Avoid coupling the current subtopics list to the search-result shape unless the underlying data is actually equivalent.
- `apps/web/core/io/dto/search.ts` currently fabricates lightweight `spaces` entries for search results, so do not assume those objects are sufficient for the current-list avatar treatment without verification.
- Space imagery in this subgraph schema comes from relation/page data, not a direct `Entity.image` field, so the fetcher should resolve it explicitly.
- The local DTO layer follows the same rule: if the implementation wants an `image` on the returned row shape, `fetchSubtopics` must synthesize it itself or return a space-shaped DTO that already includes it.
- Payload size may grow if every topic row includes all consuming spaces; cap rendered avatars while keeping the total count available.

## Acceptance Criteria

- The add-subtopic search remains entity-name based and continues to show space usage for search results.
- The current subtopics list fetch returns enough information to render topic name, avatar group, and total space count for each subtopic row.
- Space usage is deduped by space id before display.
- The count semantics are explicit and stable, including whether the current space is included.
- Missing or placeholder space images do not break the avatar UI.
- Loading, empty, and error states still behave correctly with the richer data shape.
- Add/remove subtopic actions refresh both the topic row and its usage metadata.

## Scope Boundaries

### In Scope

- Rethinking the subtopics fetch contract
- Updating the subtopics dialog to show avatar group + space count
- Preserving the current search-by-name add flow
- Mapper/query invalidation updates needed to support the richer row UI

### Out of Scope

- Final Figma polish or spacing tweaks beyond what is needed to land the feature
- Broader search UX changes
- New ranking logic for search results
- Changes to unrelated subspace or governance flows

## Risks and Open Questions

- Search results expose `spaces`, but those entries are currently lightweight placeholders in at least one DTO path; the current-list row should not rely on them blindly.
- If some topics are referenced by many spaces, the fetch payload could grow quickly; the UI should render only a small avatar subset and rely on the count for scale.
- If backend data is stale, a topic may temporarily resolve to zero spaces; the UI should handle that without special-casing failures.
- Figma may later change the visual treatment, so the first implementation should optimize for correct data shape and a reusable row structure.

## References & Research

### Internal References

- `apps/web/partials/space-page/subtopics-dialog.tsx`
- `apps/web/core/hooks/use-subtopics.ts`
- `apps/web/core/io/subgraph/fetch-subtopics.ts`
- `apps/web/core/hooks/use-search.ts`
- `apps/web/design-system/find-entity.tsx`
- `apps/web/design-system/avatar-group.tsx`
- `apps/web/design-system/avatar.tsx`
- `apps/web/partials/space-page/space-members-chip.tsx`
- `apps/web/core/hooks/use-spaces-by-ids.ts`
- `apps/web/core/io/queries.ts`
- `apps/web/partials/active-proposal/subspace-proposal.tsx`

### Related Learnings

- `docs/plans/2026-03-16-feat-subspace-proposal-detail-data-scaffolding-plan.md` reinforces the same boundary rule this feature needs: keep the canonical relation data at the fetch/DTO layer so React renders a stable, already-normalized shape.

## Suggested First Implementation Slice

1. Prove the fetch shape by updating `fetchSubtopics` to return topic rows with deduped consuming spaces.
2. Thread the richer type through `useSubtopics`.
3. Render avatar group + count in the current subtopics list.
4. Keep mutation invalidation unchanged.
