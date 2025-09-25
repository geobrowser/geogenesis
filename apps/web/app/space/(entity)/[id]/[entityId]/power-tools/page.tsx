'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import { useParams, useSearchParams } from 'next/navigation';

import * as React from 'react';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { useQueryEntities, useQueryEntity, useRelations } from '~/core/sync/use-store';

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

  // The relationId directly represents the relation - let me try to get it differently
  // Let's see if we can extract info from the URL or find another way
  console.log('DEBUG Power Tools:', {
    spaceId,
    entityId,
    relationId,
    dataBlockEntity,
    isDataBlockLoading,
  });

  console.log('DEBUG dataBlockEntity relations:', {
    relations: dataBlockEntity?.relations,
    totalRelations: dataBlockEntity?.relations?.length
  });

  // Force the useMemo to run by adding a direct call
  if (dataBlockEntity?.relations) {
    console.log('DEBUG: Looking through dataBlockEntity relations for relationId:', relationId);
    console.log('DEBUG: dataBlockEntity relations:', dataBlockEntity.relations);
    dataBlockEntity.relations.forEach((r, index) => {
      console.log(`DEBUG: Relation ${index}:`, r.id, 'vs target:', relationId);
    });
  }

  // The dataBlockEntity should have relations - let's check if one of them has our relationId
  const parentEntityId = React.useMemo(() => {
    if (!dataBlockEntity?.relations) return null;

    console.log('DEBUG: Looking through dataBlockEntity relations for relationId:', relationId);
    console.log('DEBUG: dataBlockEntity relations:', dataBlockEntity.relations);

    // Look for a relation that matches our relationId
    // This should be an incoming relation FROM the parent TO this data block
    const matchingRelation = dataBlockEntity.relations.find(r => {
      console.log('DEBUG: Checking relation:', r.id, 'vs', relationId);
      return r.id === relationId;
    });

    console.log('DEBUG: Found matching relation:', matchingRelation);

    if (matchingRelation) {
      // This relation points FROM the parent TO this data block
      const parentId = matchingRelation.fromEntity?.id;
      console.log('DEBUG: Extracted parentId:', parentId);
      return parentId;
    }

    return null;
  }, [dataBlockEntity, relationId]);

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

  // We don't need separate relation loading since we're using dataBlockEntity relations
  const isLoading = isDataBlockLoading || isParentLoading || isBlocksLoading;

  console.log('DEBUG Loading states:', {
    isDataBlockLoading,
    isParentLoading,
    isBlocksLoading,
    isLoading,
    parentEntityId,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading Power Tools...</div>
      </div>
    );
  }

  console.log('DEBUG Final check:', {
    hasDataBlockEntity: !!dataBlockEntity,
    hasRelationId: !!relationId,
    hasParentEntityId: !!parentEntityId,
  });

  if (!dataBlockEntity || !relationId) {
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
      id={parentEntityId || entityId}
      spaceId={spaceId}
      initialBlocks={blocks || [dataBlockEntity]}
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