import { SystemIds } from '@graphprotocol/grc-20';

import { useRelations } from '~/core/database/relations';
import '~/core/io/schema';
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
  // @TODO: For some reason using useEntity or useQueryEntity here causes an infinite
  // render loop. Continuing to use jotai-based hook for now.
  const blocks = useRelations({
    mergeWith: initialBlockRelations,
    selector: r => r.fromEntity.id === fromEntityId && r.type.id === SystemIds.BLOCKS,
  });

  return blocks.map(relationToRelationWithBlock).sort(sortByIndex);
}

function relationToRelationWithBlock(r: Relation): RelationWithBlock {
  return {
    ...r,
    typeOfId: r.type.id,
    // @TODO(migration): default position
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
