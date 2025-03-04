import { SystemIds } from '@graphprotocol/grc-20';

import { useEntity } from '~/core/database/entities';
import { EntityId } from '~/core/io/schema';
import { Relation } from '~/core/types';

import { Filter } from './filters';
import { useFilters } from './use-filters';
import { useSource } from './use-source';

export function useRelationsBlock() {
  const { source } = useSource();
  const { filterState } = useFilters();

  const relationBlockSourceEntity = useEntity({
    id: source.type === 'RELATIONS' ? EntityId(source.value) : EntityId(''),
  });

  const relationBlockSourceRelations = getRelevantRelationsForRelationBlock(
    relationBlockSourceEntity.relationsOut,
    filterState
  );

  return { relationBlockSourceRelations };
}

function getRelevantRelationsForRelationBlock(relations: Relation[], filterState: Filter[]) {
  const maybeFilter = filterState.find(f => f.columnId === SystemIds.RELATION_TYPE_ATTRIBUTE);
  const relationType = maybeFilter?.value;

  return relations.filter(r => r.typeOf.id === relationType);
}
