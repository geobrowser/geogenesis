'use client';

import type { Debate } from '~/core/debates/api';
import { useQueryEntities } from '~/core/sync/use-store';
import { normId } from '~/core/utils/norm-id';

import { useDebateClaimResponse } from './use-debate-claim-response';

/**
 * Where the viewer stands on the claim a debate argues, and the control that changes it.
 *
 * The same lookup the end card and the claims panel do — the claim's graph entity, then its
 * response state — on the same keys, so the stance panel, the stakes line and the end screen share
 * one set of reads rather than each asking.
 *
 * `known` is the gate the full-screen player waits on before deciding whether to ask for a stance:
 * true once both the claim's vocabulary and the viewer's own side have answered. Before that, a
 * viewer who already voted would see the question flash up and vanish.
 */
export function useMainClaimResponse(debate: Debate, enabled: boolean) {
  // Tolerates a debate row with no claim yet: every player runs this, and only the full-screen one
  // ever enables it.
  const spaceId = normId(debate.claim?.space_id ?? '');
  const claimId = normId(debate.claim?.claim_entity_id ?? '');
  const { entities } = useQueryEntities({ where: { id: { in: [claimId] } }, first: 1, enabled: enabled && claimId !== '' });
  const response = useDebateClaimResponse({
    claimId,
    spaceId,
    row: null,
    entity: enabled ? (entities[0] ?? null) : null,
  });
  return {
    ...response,
    claimId,
    spaceId,
    known: enabled && response.isResponseKindResolved && response.isViewerResponseResolved,
  };
}

export type MainClaimResponse = ReturnType<typeof useMainClaimResponse>;
