import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';

import React from 'react';

import { TableBlockSdk } from '../blocks-sdk';
import { useActionsStore } from '../hooks/use-actions-store';
import { useMergedData } from '../hooks/use-merged-data';
import { Services } from '../services';
import { Value } from '../utils/value';

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

  const filterTriple = React.useMemo(() => {
    return blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.FILTER) ?? null;
  }, [blockEntity?.triples]);

  const { data: filterValue } = useQuery({
    queryKey: ['table-block-filter-value', filterTriple?.value],
    queryFn: async () => {
      const filterValue = Value.stringValue(filterTriple ?? undefined) ?? '';

      const filterState = TableBlockSdk.createFiltersFromGraphQLString(
        filterValue,
        async id => await merged.fetchEntity({ id, endpoint: config.subgraph })
      );

      return filterState;
    },
  });

  console.log('table block v2', { blockEntity, nameTriple, filterTriple, filterValue });

  return {
    blockEntity,
  };
}
