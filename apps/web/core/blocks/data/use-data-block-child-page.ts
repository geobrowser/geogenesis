'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getRelationEntityRelations } from '~/core/io/queries';
import { useQueryEntities, useQueryEntity, useQueryRelation, useRelation } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';
import type { Entity } from '~/core/types';

type Args = {
  spaceId: string;
  dataBlockEntityId: string;
  relationId: string;
};

/**
 * Loads parent entity + block relations for fullscreen data-block child routes
 * (power-tools, ranking-compose, etc.).
 */
export function useDataBlockChildPage({ spaceId, dataBlockEntityId, relationId }: Args) {
  const { isLoading: isRelationLoading } = useQueryRelation({
    id: relationId,
    spaceId,
    enabled: Boolean(spaceId && relationId),
  });

  const { data: relationEntityRelations, isLoading: isRelationEntityLoading } = useQuery({
    queryKey: ['relation-entity-relations', relationId, spaceId],
    queryFn: ({ signal }) => Effect.runPromise(getRelationEntityRelations(relationId, spaceId, signal)),
    enabled: Boolean(spaceId && relationId),
  });

  const relationFromStore = useRelation({
    selector: r => r.id === relationId || r.entityId === relationId,
  });

  const blockRelation = relationFromStore ?? relationEntityRelations?.[0] ?? null;
  const parentEntityId = blockRelation?.fromEntity.id ?? null;

  const { entity: parentEntity, isLoading: isParentLoading } = useQueryEntity({
    spaceId,
    id: parentEntityId ?? '',
    enabled: Boolean(spaceId && parentEntityId),
  });

  const blockRelations = React.useMemo(
    () => parentEntity?.relations.filter(r => r.type.id === SystemIds.BLOCKS) ?? [],
    [parentEntity]
  );

  const blockIds = React.useMemo(() => blockRelations.map(r => r.toEntity.id), [blockRelations]);

  const { entities: blocks, isLoading: isBlocksLoading } = useQueryEntities({
    where: { id: { in: blockIds } },
    enabled: blockIds.length > 0,
  });

  const isLoading = isRelationLoading || isRelationEntityLoading || isParentLoading || isBlocksLoading;
  const hasValidParams = Boolean(spaceId && dataBlockEntityId && relationId);

  return {
    hasValidParams,
    isLoading,
    parentEntityId,
    blocks: (blocks ?? []) as Entity[],
    blockRelations: blockRelations as Relation[],
  };
}
