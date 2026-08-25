import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';

import { getRelationsByToEntityIds } from '~/core/io/queries';

export type BlockParentRelation = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  spaceId: string;
};

export type BlockPlacement = {
  parentEntityId: string;
  relationId: string;
};

export function pickBlockPlacement(
  relations: readonly BlockParentRelation[] | null | undefined
): BlockPlacement | null {
  const match = relations?.[0];
  if (!match?.id || !match.fromEntityId) return null;
  return { parentEntityId: String(match.fromEntityId), relationId: String(match.id) };
}

export async function resolveBlockPlacement(blockEntityId: string, spaceId: string): Promise<BlockPlacement | null> {
  const relations = await Effect.runPromise(getRelationsByToEntityIds([blockEntityId], SystemIds.BLOCKS, spaceId));
  return pickBlockPlacement(relations);
}
