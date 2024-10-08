import { atom } from 'jotai';

import { localRelationsAtom } from '~/core/database/write';
import { Relation } from '~/core/io/dto/entities';

import { StoredRelation } from './types';

export const createRelationsAtom = (initialRelations: Relation[]) => {
  return atom((get): StoredRelation[] => {
    const localRelations = get(localRelationsAtom);
    const locallyDeletedRelations = localRelations.filter(r => r.isDeleted).map(r => r.id);

    const deletedRelationIds = new Set(locallyDeletedRelations);
    const remoteRelationsThatWerentDeleted = initialRelations
      // Only return initialRelations that haven't been deleted locally
      .filter(r => !deletedRelationIds.has(r.id));

    // @TODO: Merge local triples for updated (not created) relations. This is for things like
    // the index.
    return [...localRelations, ...remoteRelationsThatWerentDeleted];
  });
};
