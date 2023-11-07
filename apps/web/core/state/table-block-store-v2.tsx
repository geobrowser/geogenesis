import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';

import React from 'react';

import { useActionsStore } from '../hooks/use-actions-store';
import { useMergedData } from '../hooks/use-merged-data';
import { Services } from '../services';

interface TableBlockStoreConfig {
  spaceId: string;
  entityId: string; // entity id for the table block entity
}

export function useTableBlockStoreV2({ spaceId, entityId }: TableBlockStoreConfig) {
  const { subgraph, config } = Services.useServices();
  const merged = useMergedData();
  const { actionsByEntityId } = useActionsStore();

  const { data: blockEntity } = useQuery({
    queryKey: ['table-block-entity', entityId, actionsByEntityId[entityId]],
    queryFn: () => merged.fetchEntity({ id: entityId, endpoint: config.subgraph }),
  });

  const nameTriple = React.useMemo(() => {
    return blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.NAME) ?? null;
  }, [blockEntity?.triples]);

  console.log('blockEntity', { blockEntity, nameTriple });

  return {
    blockEntity,
  };
}
