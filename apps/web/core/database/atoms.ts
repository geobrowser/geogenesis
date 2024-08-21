import { atom } from 'jotai';

import { localRelationsAtom } from '~/core/database/write';
import { Relation } from '~/core/io/dto/entities';

// @TODO: This should read from local relations atom instead of local ops atom
export const createRelationsAtom = (initialRelations: Relation[]) => {
  return atom(get => {
    const localRelations = get(localRelationsAtom);

    /***********************************************************************************************/
    // A relation might exist remotely but is deleted locally. We need to remove those from the
    // list of relations that we return.
    //
    // We can consider a relation as being deleted when its Types -> Relation triple is deleted. This set
    // of ids might include relations from entities besides the entityPageId that were deleted locally.
    //
    // Later we filter these to only be the relations that are from the entityPageId.
    const locallyDeletedRelations = localRelations.filter(r => r.isDeleted).map(r => r.id);

    const deletedRelationIds = new Set(...locallyDeletedRelations);
    const remoteRelationsThatWerentDeleted = initialRelations
      // Only return relations coming from the entity page id which haven't been deleted locally
      .filter(r => !deletedRelationIds.has(r.id));

    // const localRelationById = groupBy(localRelations, r => r.id);

    // const activeRemoteRelations = remoteRelationsThatWerentDeleted.map((r): Relation => {
    //   const localRelation = localRelationById[r.id];

    //   return {
    //     id: r.id,
    //     typeOf: {
    //       id: maybeLocalTypeOfTriple ? EntityId(maybeLocalTypeOfTriple.value.value) : EntityId(r.typeOf.id),
    //       name: maybeLocalTypeOfTriple
    //         ? maybeLocalTypeOfTriple.value.type === 'ENTITY'
    //           ? maybeLocalTypeOfTriple.value.name
    //           : r.typeOf.name
    //         : r.typeOf.name,
    //     },
    //     index: maybeLocalIndexTriple ? maybeLocalIndexTriple.value.value : r.index,
    //     fromEntity: {
    //       id: maybeLocalFromTriple ? EntityId(maybeLocalFromTriple.value.value) : r.fromEntity.id,
    //       name: maybeLocalFromTriple
    //         ? maybeLocalFromTriple.value.type === 'ENTITY'
    //           ? maybeLocalFromTriple.value.name
    //           : r.fromEntity.name
    //         : r.fromEntity.name,
    //     },
    //     toEntity: {
    //       id: maybeLocalToTriple ? EntityId(maybeLocalToTriple.value.value) : r.toEntity.id,
    //       renderableType: 'DEFAULT',
    //       value: maybeLocalToTriple
    //         ? maybeLocalToTriple.value.type === 'ENTITY'
    //           ? maybeLocalToTriple.value.value
    //           : r.toEntity.value
    //         : r.toEntity.value,
    //       name: maybeLocalToTriple
    //         ? maybeLocalToTriple.value.type === 'ENTITY'
    //           ? maybeLocalToTriple.value.name
    //           : r.toEntity.name
    //         : r.toEntity.name,

    //       // @TODO(database): Not sure if this is correct
    //       triples: localTriples.filter(t => t.entityId === r.toEntity.id),
    //     },
    //   };
    // });

    // @TODO: Merge local triples for updated (not created) relations. This is for things like
    // the index.
    return [...localRelations, ...remoteRelationsThatWerentDeleted];
  });
};
