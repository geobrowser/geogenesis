'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';
import { useParams, useSearchParams } from 'next/navigation';

import * as React from 'react';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { getRelationEntityRelations } from '~/core/io/queries';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { useQueryEntities, useQueryEntity, useQueryRelation, useRelation } from '~/core/sync/use-store';

import { PowerToolsScreen } from '~/partials/power-tools/power-tools-screen';

export default function PowerToolsPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const spaceId = params?.id as string;
  const dataBlockEntityId = params?.entityId as string;
  const relationId = searchParams?.get('relationId') ?? '';

  // Hydrate the relation from the server, then read it from the reactive store.
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

  const blockRelations = React.useMemo(() => {
    return parentEntity?.relations.filter(r => r.type.id === SystemIds.BLOCKS) ?? [];
  }, [parentEntity]);

  const blockIds = React.useMemo(() => blockRelations.map(r => r.toEntity.id), [blockRelations]);

  const { entities: blocks, isLoading: isBlocksLoading } = useQueryEntities({
    where: {
      id: { in: blockIds },
    },
    enabled: blockIds.length > 0,
  });

  const isLoading = isRelationLoading || isRelationEntityLoading || isParentLoading || isBlocksLoading;

  if (!spaceId || !dataBlockEntityId || !relationId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Invalid parameters</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading Power Tools...</div>
      </div>
    );
  }

  if (!parentEntityId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Data block not found</div>
      </div>
    );
  }

  return (
    <EntityStoreProvider id={parentEntityId} spaceId={spaceId}>
      <EditorProvider
        id={parentEntityId}
        spaceId={spaceId}
        initialBlocks={blocks ?? []}
        initialBlockRelations={blockRelations}
      >
        <DataBlockProvider spaceId={spaceId} entityId={dataBlockEntityId} relationId={relationId}>
          <PowerToolsScreen />
        </DataBlockProvider>
      </EditorProvider>
    </EntityStoreProvider>
  );
}
