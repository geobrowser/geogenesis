import { Position } from '@geoprotocol/geo-sdk/lite';

type ExistingBlockRelation = {
  position?: string | null;
  block: { id: string };
};

type NewBlockRelation = {
  position?: string | null;
  toEntity: { id: string };
};

/** Generates a block position from its neighbours in the requested document order. */
export function makeBlockPosition({
  blockId,
  nextBlockIds,
  blockRelations,
  newBlocks,
}: {
  blockId: string;
  nextBlockIds: string[];
  blockRelations: ExistingBlockRelation[];
  newBlocks: NewBlockRelation[];
}) {
  const position = nextBlockIds.indexOf(blockId);
  const beforeBlockId = nextBlockIds[position - 1];
  const afterBlockId = nextBlockIds[position + 1];

  // Insertions are absent from these collections. Reorders are present with
  // their stale position, so exclude the moved block before finding fallback
  // neighbours at the start or end of the list.
  const allRelations = [
    ...blockRelations.map(relation => ({
      blockId: relation.block.id,
      // @TODO(migration): default position
      position: relation.position ?? 'a0',
    })),
    ...newBlocks.map(relation => ({
      blockId: relation.toEntity.id,
      // @TODO(migration): default position
      position: relation.position ?? 'a0',
    })),
  ]
    .filter(relation => relation.blockId !== blockId)
    .sort((a, b) => (a.position < b.position ? -1 : 1));

  const beforePosition = allRelations.find(relation => relation.blockId === beforeBlockId)?.position;
  const beforeRelationIndex = allRelations.findIndex(relation => relation.blockId === beforeBlockId);
  const afterPosition =
    allRelations.find(relation => relation.blockId === afterBlockId)?.position ??
    (beforeRelationIndex >= 0 ? allRelations[beforeRelationIndex + 1]?.position : undefined);

  return Position.generateBetween(beforePosition ?? null, afterPosition ?? null);
}
