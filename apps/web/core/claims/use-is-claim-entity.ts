'use client';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { useQueryEntity } from '~/core/sync/use-store';

const normalizeId = (id: string) => id.replace(/-/g, '').toLowerCase();

const CLAIM_TYPE = normalizeId(CLAIM_TYPE_ID);

export function useIsClaimEntity(entityId: string, spaceId: string): boolean {
  const { entity } = useQueryEntity({ id: entityId, spaceId });
  return entity?.types.some(type => normalizeId(type.id) === CLAIM_TYPE) ?? false;
}
