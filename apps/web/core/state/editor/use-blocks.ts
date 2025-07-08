import { SystemIds } from '@graphprotocol/grc-20';
import { useSelector } from '@xstate/store/react';
import equals from 'fast-deep-equal';

import { mergeRelations } from '~/core/sync/orm';
import { reactiveRelations } from '~/core/sync/store';
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
  const blocks = useSelector(
    reactiveRelations,
    relations =>
      mergeRelations(initialBlockRelations ?? [], relations).filter(
        r => r.fromEntity.id === fromEntityId && r.type.id === SystemIds.BLOCKS
      ),
    equals
  );

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
