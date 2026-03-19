import { SystemIds } from '@geoprotocol/geo-sdk';

import { useQueryEntity } from '~/core/sync/use-store';
import { Relation } from '~/core/types';

import { Filter } from './filters';
import { Source } from './source';

type UseRelationsBlockOptions = {
  source: Source;
  filterState: Filter[];
};

export function useRelationsBlock({ source, filterState }: UseRelationsBlockOptions) {
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
