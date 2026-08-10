'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { isClaimPublished } from '~/core/claims/publish';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { getUserEntityResponse } from '~/core/io/queries';
import { getEntityResponseKindForEntity, userEntityResponseQueryKey } from '~/core/responses/entity-response';
import { useClaimResponseBatchState } from '~/core/responses/use-claim-response-summaries';
import { useDebatesEnabled } from '~/core/state/feature-flags';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

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
  const responseKind = getEntityResponseKindForEntity(entity, spaceId);
  const isClaim = responseKind === 'stance' || responseKind === 'veracity';
  const published = entity ? isClaimPublished(entity) : false;
  const responseBatch = useClaimResponseBatchState();
  const { personalSpaceId, isLoading: isPersonalSpaceLoading } = usePersonalSpaceId();
  const { data: viewerResponse } = useQuery({
    queryKey: userEntityResponseQueryKey(personalSpaceId, entityId, spaceId, 0, responseKind ?? 'stance'),
    queryFn: () =>
      personalSpaceId && responseKind
        ? Effect.runPromise(getUserEntityResponse(personalSpaceId, entityId, spaceId, responseKind))
        : null,
    enabled:
      isDebatesEnabled &&
      isClaim &&
      published &&
      !isPersonalSpaceLoading &&
      Boolean(personalSpaceId) &&
      (!responseBatch.managed || responseBatch.ready),
    staleTime: 30_000,
  });

  const debateClaimsQuery = useDebateClaims(spaceId, published ? [entityId] : [], isDebatesEnabled && isClaim);
  const debateClaim = debateClaimsQuery.data?.claims.find(claim => claim.claim_entity_id === entityId) ?? null;
  const activity = useDebateActivity(isDebatesEnabled && isClaim).data ?? null;
  const hasActiveFlowElsewhere = Boolean(activity?.match || activity?.debate || activity?.rematch);

  if (!isDebatesEnabled || !isClaim) return null;

  const canEnable = published && !debateClaim?.active_debate && !debateClaim?.active_match && !hasActiveFlowElsewhere;

  return (
    <ClaimDebateReadiness
      debateClaim={debateClaim}
      responseKind={responseKind}
      viewerPosition={
        viewerResponse === undefined ? undefined : viewerResponse === null ? null : viewerResponse === 'positive'
      }
      entityId={entityId}
      spaceId={spaceId}
      canEnable={canEnable}
      compact
    />
  );
}
