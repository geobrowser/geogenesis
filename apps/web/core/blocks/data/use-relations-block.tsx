import { SystemIds } from '@graphprotocol/grc-20';

import { useQueryEntity } from '~/core/sync/use-store';
import { Relation } from '~/core/v2.types';

import { Filter } from './filters';
import { useFilters } from './use-filters';
import { useSource } from './use-source';

export function useRelationsBlock() {
  const { source } = useSource();
  const { filterState } = useFilters();

  const { entity: relationBlockSourceEntity } = useQueryEntity({
    id: source.type === 'RELATIONS' ? source.value : undefined,
    enabled: source.type === 'RELATIONS',
  });

  const relationBlockSourceRelations = getRelevantRelationsForRelationBlock(
    relationBlockSourceEntity?.relations ?? [],
    filterState
  );

  return { relationBlockSourceRelations };
}

function getRelevantRelationsForRelationBlock(relations: Relation[], filterState: Filter[]) {
  const maybeFilter = filterState.find(f => f.columnId === SystemIds.RELATION_TYPE_PROPERTY);
  const relationType = maybeFilter?.value;

  return relations.filter(r => r.type.id === relationType);
}
