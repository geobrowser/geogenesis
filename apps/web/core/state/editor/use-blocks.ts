import { SystemIds } from '@graphprotocol/grc-20';

import { useRelations } from '~/core/database/relations';
import { EntityId, TypeId } from '~/core/io/schema';
import { Relation, RenderableEntityType } from '~/core/types';

export type RelationWithBlock = {
  relationId: EntityId;
  typeOfId: TypeId;
  index: string;
  block: {
    id: EntityId;
    type: RenderableEntityType;
    value: string;
  };
};

/**
 * Blocks are defined via relations with relation type of {@link SystemIds.BLOCKS}.
 * These relations point to entities which are renderable by the content editor. The
 * currently renderable block types are:
 * 1) Text
 * 2) Data
 * 3) Image
 *
 */
export function useBlocks(fromEntityId: string, initialBlockRelations?: Relation[]) {
  const blocks = useRelations({
    mergeWith: initialBlockRelations,
    selector: r => r.fromEntity.id === fromEntityId && r.typeOf.id === EntityId(SystemIds.BLOCKS),
  });

  return blocks.map(relationToRelationWithBlock).sort(sortByIndex);
}

function relationToRelationWithBlock(r: Relation): RelationWithBlock {
  return {
    typeOfId: TypeId(r.typeOf.id),
    index: r.index,
    block: {
      id: r.toEntity.id,
      type: r.toEntity.renderableType,
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
