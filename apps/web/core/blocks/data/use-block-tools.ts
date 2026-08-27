'use client';

import { useSelector } from '@xstate/store/react';

import * as React from 'react';

import equal from 'fast-deep-equal';

import { ID } from '~/core/id';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { reactiveRelations } from '~/core/sync/store';
import { store } from '~/core/sync/use-sync-engine';
import { Relation } from '~/core/types';

import { DATA_BLOCK_TOOLS_PROPERTY_ID, LINK_INGESTION_TOOL_ID } from './block-ontology-ids';
import { useDataBlockInstance } from './use-data-block';

export function useBlockTools() {
  const { entityId, relationId } = useDataBlockInstance();
  const { blockRelations } = useEditorStoreLite();

  const blocksRelationEntityId = relationId || blockRelations.find(r => r.toEntity.id === entityId)?.entityId || '';

  const blockRelationRelations = useSelector(
    reactiveRelations,
    () => {
      if (!blocksRelationEntityId) return [] as Relation[];
      return store.getResolvedRelations(blocksRelationEntityId);
    },
    equal
  );

  const toolIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const relation of blockRelationRelations) {
      if (relation.isDeleted) continue;
      if (!ID.equals(relation.type.id, DATA_BLOCK_TOOLS_PROPERTY_ID)) continue;
      ids.add(relation.toEntity.id);
    }
    return ids;
  }, [blockRelationRelations]);

  const hasLinkIngestionTool = React.useMemo(
    () => [...toolIds].some(id => ID.equals(id, LINK_INGESTION_TOOL_ID)),
    [toolIds]
  );

  return {
    blocksRelationEntityId,
    toolIds,
    hasLinkIngestionTool,
  };
}
