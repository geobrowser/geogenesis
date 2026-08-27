'use client';

import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getRelationEntityRelations } from '~/core/io/queries';
import { useQueryEntities, useQueryEntity, useQueryRelation, useRelation } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';
import type { Entity } from '~/core/types';

type Args = {
  spaceId: string;
  blockEntityId: string;
  relationId: string;
  parentEntityIdParam?: string;
};

function isBlocksRelationToEntity(relation: Relation, entityId: string, spaceId: string) {
  return (
    relation.type.id === SystemIds.BLOCKS &&
    relation.toEntity.id === entityId &&
    relation.spaceId === spaceId &&
    !relation.isDeleted
  );
}

export function useRankingComposePage({ spaceId, blockEntityId, relationId, parentEntityIdParam = '' }: Args) {
  const parentEntityIdFromUrl =
    parentEntityIdParam && IdUtils.isValid(parentEntityIdParam) ? parentEntityIdParam : null;

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

  const relationFromBlockEntity = useRelation({
    selector: r => isBlocksRelationToEntity(r, blockEntityId, spaceId),
  });

  const blockRelation = relationFromStore ?? relationFromBlockEntity ?? relationEntityRelations?.[0] ?? null;
  const parentEntityId = blockRelation?.fromEntity.id ?? parentEntityIdFromUrl;

  const { entity: parentEntity, isLoading: isParentLoading } = useQueryEntity({
    spaceId,
    id: parentEntityId ?? '',
    enabled: Boolean(spaceId && parentEntityId),
  });

  const blockRelations = React.useMemo(() => {
    const fromParent = parentEntity?.relations.filter(r => r.type.id === SystemIds.BLOCKS) ?? [];
    if (!relationFromBlockEntity) return fromParent;
    if (fromParent.some(r => r.toEntity.id === blockEntityId)) return fromParent;
    return [...fromParent, relationFromBlockEntity];
  }, [parentEntity, relationFromBlockEntity, blockEntityId]);

  const blockIds = React.useMemo(() => {
    const ids = blockRelations.map(r => r.toEntity.id);
    if (!ids.includes(blockEntityId)) ids.push(blockEntityId);
    return ids;
  }, [blockRelations, blockEntityId]);

  const { entities: blocks, isLoading: isBlocksLoading } = useQueryEntities({
    where: { id: { in: blockIds } },
    enabled: blockIds.length > 0,
  });

  const isResolvingRelation = Boolean(relationId) && (isRelationLoading || isRelationEntityLoading);
  const isLoading =
    isResolvingRelation || (Boolean(parentEntityId) && isParentLoading) || (blockIds.length > 0 && isBlocksLoading);
  const hasValidParams = Boolean(spaceId && blockEntityId && relationId);

  return {
    hasValidParams,
    isLoading,
    parentEntityId,
    blocks: (blocks ?? []) as Entity[],
    blockRelations: blockRelations as Relation[],
  };
}
