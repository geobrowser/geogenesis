'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import { useParams, useSearchParams } from 'next/navigation';

import * as React from 'react';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { useQueryEntities, useQueryEntity, getRelation } from '~/core/sync/use-store';

import { PowerToolsView } from '~/partials/power-tools/power-tools-view';

export default function PowerToolsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const spaceId = params.id as string;
  const entityId = params.entityId as string;
  const relationId = searchParams.get('relationId') || '';

  // The entityId is the data block entity ID
  // The relationId is the relation that connects from parent entity TO this data block
  const { entity: dataBlockEntity, isLoading: isDataBlockLoading } = useQueryEntity({
    spaceId: spaceId,
    id: entityId,
  });

  // Get the actual relation object to find the parent entity
  const blockRelation = React.useMemo(() => {
    if (!relationId) return null;
    return getRelation({ id: relationId });
  }, [relationId]);

  const parentEntityId = blockRelation?.fromEntity?.id;
  const isRelationLoading = !relationId || !blockRelation;

  // Get the parent entity to fetch its blocks
  const { entity: parentEntity, isLoading: isParentLoading } = useQueryEntity({
    spaceId: spaceId,
    id: parentEntityId || '',
    enabled: !!parentEntityId,
  });

  // Get all blocks from the parent entity
  const blockRelations = React.useMemo(() => {
    return parentEntity?.relations.filter(r => r.type.id === SystemIds.BLOCKS) || [];
  }, [parentEntity]);

  const blockIds = React.useMemo(() => {
    return blockRelations.map(r => r.toEntity.id);
  }, [blockRelations]);

  const { entities: blocks, isLoading: isBlocksLoading } = useQueryEntities({
    where: {
      id: {
        in: blockIds,
      },
    },
    enabled: blockIds.length > 0,
  });

  const isLoading = isDataBlockLoading || isRelationLoading || isParentLoading || isBlocksLoading;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading Power Tools...</div>
      </div>
    );
  }

  if (!dataBlockEntity || !relationId || !parentEntityId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="text-lg">Data block not found</div>
          <div className="text-sm text-gray-500">
            Please open Power Tools from a data block's context menu
          </div>
        </div>
      </div>
    );
  }

  return (
    <EditorProvider
      id={parentEntityId}
      spaceId={spaceId}
      initialBlocks={blocks || []}
      initialBlockRelations={blockRelations}
    >
      <DataBlockProvider
        spaceId={spaceId}
        entityId={entityId}
        relationId={relationId}
      >
        <PowerToolsView />
      </DataBlockProvider>
    </EditorProvider>
  );
}