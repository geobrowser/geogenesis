# Plan: Topic ID During Space Creation

**Created:** 2026-03-23
**Status:** Planned

## Overview

Update space creation so the selected topic is treated as `topicId` end-to-end instead of `entityId`, and ensure the corresponding onchain topic event is emitted during creation.

This change affects two distinct creation flows:

1. **DAO/public spaces**: include the initial topic in `createDAOSpaceProxy(...)` so the DAO contract emits the topic automatically.
2. **Personal-style spaces**: emit `TOPIC_DECLARED` manually after the initial publish succeeds, using the same `SpaceRegistry.enter()` pattern already used elsewhere in the app.

## Current State

### User flow

- [create-space-dialog.tsx](/Users/byronguina/work/code/geogenesis/apps/web/partials/create-space/create-space-dialog.tsx) and [dialog.tsx](/Users/byronguina/work/code/geogenesis/apps/web/partials/onboarding/dialog.tsx) store the selected entity as `entityId`.
- `FindEntity` supports two paths:
  - select an existing entity, which produces an id
  - type a new entity name, which produces no id and lets creation generate a new entity id later

### Creation flow

- [use-deploy-space.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-deploy-space.ts) is the main create-space orchestrator.
- [use-create-personal-space.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-create-personal-space.ts) is the onboarding-specific personal-space creator.
- Both flows currently pass `entityId` into [generate-ops-for-space-type.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/utils/contracts/generate-ops-for-space-type.ts).
- DAO creation currently calls `createDAOSpaceProxy(...)` with `EMPTY_SPACE_ID` as `_initialTopicId`.
- Personal-space creation currently publishes content but does not emit a topic declaration afterwards.
- Completion polling only waits for the space content/entity name to be indexed, not for `space.topicId` to match the intended topic.

### Existing topic logic to reuse

- [use-space-topic.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-space-topic.ts) already implements the correct topic declaration behavior:
  - personal spaces emit `TOPIC_DECLARED` directly via `SpaceRegistry.enter()`
  - DAO spaces create a governance proposal using `PROPOSAL_CREATED` and `DAOSpace.ping(...)`
- [space-registry.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/utils/contracts/space-registry.ts) already defines the relevant action constants and ABI fragments.
- [dao-space-factory.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/utils/contracts/dao-space-factory.ts) already exposes `_initialTopicId` in the ABI.

## Key Design Decision

`topicId` and the space's entity id are the same underlying entity.

That means the plan should treat the current `entityId` create-flow input as a misnamed `topicId`, not as a separate concept. The same id should be used for:

- the topic associated with the space
- the entity created or reused for the space itself

The only remaining distinction is operational:

- sometimes the id is supplied by selecting an existing entity
- sometimes the id is generated during creation when the user types a new entity name

## Assumption For New-Entity Flow

When the user does **not** select an existing entity and instead types a new entity name:

- graph-op generation should create a new entity id
- that generated id should become the `topicId` for the created space

This preserves the current behavior where the space is “for” the entity being created while making `topicId` the canonical name end-to-end.

If this assumption is wrong, implementation should stop and clarify before coding.

## Proposed Solution

### Phase 1: Rename the user-facing creation contract

Update create-flow inputs from `entityId` to `topicId` in:

- [use-deploy-space.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-deploy-space.ts)
- [use-create-personal-space.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-create-personal-space.ts)
- [create-space-dialog.tsx](/Users/byronguina/work/code/geogenesis/apps/web/partials/create-space/create-space-dialog.tsx)
- [dialog.tsx](/Users/byronguina/work/code/geogenesis/apps/web/partials/onboarding/dialog.tsx)

Update [generate-ops-for-space-type.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/utils/contracts/generate-ops-for-space-type.ts) so it also uses `topicId` terminology and returns the actual id used for the created/reused entity. That returned id becomes the source of truth for downstream contract writes and polling.

### Phase 2: Resolve the final topic ID once per create flow

Each create flow should compute:

- `requestedTopicId`: the optionally selected existing topic from the UI
- `resolvedTopicId`: the actual id used for the created/reused entity, equal to `requestedTopicId` when provided and otherwise generated during creation

That `resolvedTopicId` becomes the source of truth for:

- DAO `_initialTopicId`
- personal `TOPIC_DECLARED`
- post-create polling

This keeps the new-entity path correct without introducing a second conceptual identifier.

### Phase 3: DAO creation sets initial topic onchain

In [use-deploy-space.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-deploy-space.ts):

- replace `EMPTY_SPACE_ID` in `createDAOSpaceProxy(...)` with the resolved topic id converted to bytes16 hex
- keep topic conversion at the contract boundary, matching the existing pattern in [use-space-topic.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-space-topic.ts)
- retain current DAO semantics: one creation transaction, no separate manual topic emission step

### Phase 4: Personal-style creation emits `TOPIC_DECLARED` after publish

In both:

- [use-deploy-space.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-deploy-space.ts)
- [use-create-personal-space.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-create-personal-space.ts)

add a second step after the publish edit succeeds:

1. build `TOPIC_DECLARED` calldata using the same rules as [use-space-topic.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-space-topic.ts)
2. submit it through the smart account as a separate `SpaceRegistry.enter()` operation
3. only mark creation complete after the topic is indexed

Implementation should extract the personal-topic calldata builder into a shared contract utility instead of duplicating the encoding in multiple hooks.

### Phase 5: Shared topic contract utilities

Extract topic-declaration helpers from [use-space-topic.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-space-topic.ts) into a reusable contract utility module under `apps/web/core/utils/contracts/`.

That utility should own:

- topic UUID validation/normalization boundary usage
- bytes16 and bytes32 conversions needed for topic actions
- personal `TOPIC_DECLARED` calldata building
- any create-time topic helpers needed by the DAO path

Then update [use-space-topic.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-space-topic.ts) to reuse that shared utility so there is only one canonical encoding path.

### Phase 6: Update completion and retry behavior

Creation should no longer be considered done when only the space entity name appears.

Polling should wait until:

- the space exists
- if a topic was intended, `space.topicId === resolvedTopicId`

Retry behavior should distinguish between:

- registration/create tx failure
- content publish failure
- personal topic-emission failure
- indexing timeout after otherwise successful writes

For personal spaces especially, retries must be step-aware so the app does not replay the entire create sequence after the space already exists.

### Phase 7: SDK compatibility work

The installed `@geoprotocol/geo-sdk` already supports DAO initial topics internally via `initialTopicId`, but the desired public API name is `topicId`.

Plan a separate but related SDK update:

- update DAO `createSpace(...)` types to accept `topicId`
- keep `initialTopicId` as a backward-compatible alias or migrate callers in one pass
- ship that as a Bun patch in this repo if needed immediately
- ideally upstream the rename so the repo can drop the local patch later

This SDK work is not required for the app-side direct factory call to function, but it is required to satisfy the API contract you described.

## Technical Considerations

### Naming

- `topicId` should be the canonical name throughout the create flow.
- The entity created or reused for the space is the topic entity.
- Avoid renaming unrelated DTOs or query fields that already correctly use `topicId`.

### Boundary handling

- Keep UUID-to-hex conversion at the contract boundary.
- Do not store bytes16/bytes32 topic representations in React state.
- Reuse [uuidToHex](/Users/byronguina/work/code/geogenesis/apps/web/core/id/normalize.ts) and [padBytes16ToBytes32](/Users/byronguina/work/code/geogenesis/apps/web/core/utils/contracts/governance.ts) where appropriate.

### Telemetry

- Preserve the existing `web.write.createSpace.*` spans in create hooks.
- Add a distinct span for the personal topic-emission step instead of folding it into publish-edit telemetry.

### Partial success

Personal-space creation becomes a two-write flow. The UI and logs should be able to express:

- space creation succeeded
- topic declaration failed

This is materially different from “creation failed.”

## Acceptance Criteria

- [ ] The create-space UI and create hooks use `topicId` rather than `entityId` throughout the user-facing creation flow.
- [ ] The graph-op generator and create hooks use `topicId` consistently for the entity created or reused for the space.
- [ ] DAO space creation passes the resolved topic id to `createDAOSpaceProxy(...)` so the created DAO indexes with the expected `topicId`.
- [ ] Personal-style space creation emits `TOPIC_DECLARED` after publish and only completes once the topic is indexed.
- [ ] If the user creates a brand-new entity instead of selecting an existing one, the generated entity id becomes the resolved topic id.
- [ ] Completion polling waits for `space.topicId` when a topic is expected, not just for the space name/entity content.
- [ ] Errors distinguish between creation failure, topic-emission failure, and indexing timeout.
- [ ] [use-space-topic.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-space-topic.ts) remains the source of truth for personal-vs-DAO topic encoding behavior after refactoring.
- [ ] The repo includes a plan for the SDK API rename from `initialTopicId` to `topicId`.

## Verification Plan

### App verification

- Add focused unit tests for any extracted topic contract utility.
- Add or update tests covering resolved-topic behavior when:
  - an existing topic is selected
  - no existing topic is selected and a new entity id is generated
- Verify DAO calldata now includes the resolved initial topic.
- Verify personal creation submits the follow-up topic declaration call.
- Verify polling waits for indexed `topicId`.

### Manual verification

1. Create a personal space from onboarding with an existing entity selected.
2. Confirm the resulting space indexes with the expected `topicId`.
3. Create a personal-style non-onboarding space with a typed new entity.
4. Confirm the resulting space indexes with the generated entity as `topicId`.
5. Create a DAO/public space with an existing entity selected.
6. Confirm the DAO space indexes with the expected `topicId` without a second manual topic write.

### SDK verification

- Update or add SDK type-level/unit coverage proving DAO `createSpace(...)` accepts `topicId`.
- If using a Bun patch, verify lockfile/package metadata reflects the patch cleanly.

## Risks

- A naive rename from `entityId` to `topicId` can still break the “new entity” path if the generated id is not surfaced back to the create flow as the resolved topic id.
- Personal-space retry handling can accidentally duplicate steps if the app does not track whether the space already exists before re-running.
- Polling only for space existence will create flaky UX where the success screen appears before the topic is queryable.
- SDK patching can drift from upstream if the local patch is not minimal and well-scoped.

## Related Files

- [use-deploy-space.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-deploy-space.ts)
- [use-create-personal-space.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-create-personal-space.ts)
- [use-space-topic.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/hooks/use-space-topic.ts)
- [generate-ops-for-space-type.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/utils/contracts/generate-ops-for-space-type.ts)
- [dao-space-factory.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/utils/contracts/dao-space-factory.ts)
- [space-registry.ts](/Users/byronguina/work/code/geogenesis/apps/web/core/utils/contracts/space-registry.ts)
- [create-space-dialog.tsx](/Users/byronguina/work/code/geogenesis/apps/web/partials/create-space/create-space-dialog.tsx)
- [dialog.tsx](/Users/byronguina/work/code/geogenesis/apps/web/partials/onboarding/dialog.tsx)
