'use client';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { isClaimPublishedInSpace } from '~/core/claims/publish';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';

import { hasActiveDebateFlow } from './activity-state';
import { ClaimDebateReadiness } from './claim-debate-readiness';
import { useDebateActivity, useDebateClaims } from './hooks';

type ClaimDebateButtonProps = {
  entityId: string;
  spaceId: string;
  /** Avoids a duplicate entity subscription when the parent already has the entity. */
  entity?: Entity | null;
};

export function ClaimDebateButton({
  entityId,
  spaceId: requestedSpaceId,
  entity: providedEntity,
}: ClaimDebateButtonProps) {
  // Unscoped, for the reason `EntityVoteButtons` reads it unscoped: `types` is derived across every
  // space either way, and the values that say where the claim is named are what resolve the space
  // below. A lookup scoped to the space we were handed can't correct that space.
  const { entity: fetchedEntity } = useQueryEntity({
    id: entityId,
    enabled: providedEntity == null,
  });
  const entity = providedEntity ?? fetchedEntity;
  const isClaim = entity?.types.some(type => type.id === CLAIM_TYPE_ID) ?? false;
  // geo-chat keys a claim's row and its readiness on the space the claim lives in, and the response
  // that readiness depends on is published against that same space. A data block row hands us its
  // pinned target space, or the block's own space when the collection item pinned none — which for
  // a claim curated onto someone's page is a space geo-chat has never indexed, and answers 404.
  const spaceId = resolveEntitySpaceId(entity, requestedSpaceId);
  const published = entity ? isClaimPublishedInSpace(entity, spaceId) : false;

  const debateClaimsQuery = useDebateClaims(spaceId, published ? [entityId] : [], isClaim);
  const debateClaim = debateClaimsQuery.data?.claims.find(claim => claim.claim_entity_id === entityId) ?? null;
  const activity = useDebateActivity(isClaim).data ?? null;
  const hasActiveFlowElsewhere = hasActiveDebateFlow(activity);

  if (!isClaim) return null;

  const canEnable = published && !debateClaim?.active_debate && !hasActiveFlowElsewhere;

  return (
    <ClaimDebateReadiness
      debateClaim={debateClaim}
      entityId={entityId}
      spaceId={spaceId}
      canEnable={canEnable}
      compact
    />
  );
}
