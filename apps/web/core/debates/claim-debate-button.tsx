'use client';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { isClaimPublished } from '~/core/claims/publish';
import { useDebatesEnabled } from '~/core/state/feature-flags';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

import { hasActiveDebateFlow } from './activity-state';
import { ClaimDebateReadiness } from './claim-debate-readiness';
import { useDebateActivity, useDebateClaims } from './hooks';

type ClaimDebateButtonProps = {
  entityId: string;
  spaceId: string;
  /** Avoids a duplicate entity subscription when the parent already has the entity. */
  entity?: Entity | null;
};

export function ClaimDebateButton({ entityId, spaceId, entity: providedEntity }: ClaimDebateButtonProps) {
  const isDebatesEnabled = useDebatesEnabled();
  const { entity: fetchedEntity } = useQueryEntity({
    id: entityId,
    spaceId,
    enabled: isDebatesEnabled && providedEntity == null,
  });
  const entity = providedEntity ?? fetchedEntity;
  const isClaim = entity?.types.some(type => type.id === CLAIM_TYPE_ID) ?? false;
  const published = entity ? isClaimPublished(entity) : false;

  const debateClaimsQuery = useDebateClaims(spaceId, published ? [entityId] : [], isDebatesEnabled && isClaim);
  const debateClaim = debateClaimsQuery.data?.claims.find(claim => claim.claim_entity_id === entityId) ?? null;
  const activity = useDebateActivity(isDebatesEnabled && isClaim).data ?? null;
  const hasActiveFlowElsewhere = hasActiveDebateFlow(activity);

  if (!isDebatesEnabled || !isClaim) return null;

  const canEnable = published && !debateClaim?.active_debate && !debateClaim?.active_match && !hasActiveFlowElsewhere;

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
