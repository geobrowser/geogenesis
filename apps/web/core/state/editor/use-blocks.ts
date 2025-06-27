import { SystemIds } from '@graphprotocol/grc-20';

import { useRelations } from '~/core/database/relations';
import { Relation, RenderableEntityType } from '~/core/v2.types';

export type RelationWithBlock = Relation & {
  relationId: string;
  typeOfId: string;
  index: string;
  block: {
    id: string;
    type: RenderableEntityType;
    value: string;
  };
};

export function useBlocks(fromEntityId: string, initialBlockRelations?: Relation[]) {
  const blocks = useRelations({
    mergeWith: initialBlockRelations,
    selector: r => r.fromEntity.id === fromEntityId && r.type.id === SystemIds.BLOCKS,
  });

  return blocks?.map(relationToRelationWithBlock).sort(sortByIndex) ?? [];
}

function relationToRelationWithBlock(r: Relation): RelationWithBlock {
  return {
    ...r,
    typeOfId: r.type.id,
    // @TODO(migration): default position.
    index: r.position ?? 'a0',
    block: {
      id: r.toEntity.id,
      type: r.renderableType,
      value: r.toEntity.value,
    },
    relationId: r.id,
  };
}

function sortByIndex(a: RelationWithBlock, z: RelationWithBlock) {
  if (a.index < z.index) {
    return -1;
  }
  if (a.index > z.index) {
    return 1;
  }
  return 0;
}
