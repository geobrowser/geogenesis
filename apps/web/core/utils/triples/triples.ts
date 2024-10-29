import { Op } from '@geogenesis/sdk';

import { StoredTriple } from '~/core/database/types';
import { createTripleId } from '~/core/id/create-id';
import { Triple } from '~/core/types';

export function timestamp() {
  return new Date().toISOString();
}

export function merge(local: StoredTriple[], remote: Triple[]): StoredTriple[] {
  const localTripleIds = new Set(local.map(t => t.id));
  const remoteTriplesWithoutLocalTriples = remote.filter(
    t => !localTripleIds.has(createTripleId({ ...t, space: t.space }))
  );
  const remoteTriplesMappedToLocalTriples = remoteTriplesWithoutLocalTriples.map(t => ({
    ...t,
    hasBeenPublished: false,
    isDeleted: false,
    id: createTripleId({ ...t, space: t.space }),
    timestamp: timestamp(),
  }));

  return [...remoteTriplesMappedToLocalTriples, ...local];
}

export function prepareTriplesForPublishing(triples: Triple[], spaceId: string): Op[] {
  const triplesToPublish = triples.filter(
    // Deleted ops have a value of ''. Make sure we don't filter those out
    t => t.space === spaceId && !t.hasBeenPublished && t.attributeId !== '' && t.entityId !== ''
  );
  return triplesToPublish.map((t): Op => {
    if (t.isDeleted) {
      return {
        type: 'DELETE_TRIPLE',
        triple: {
          entity: t.entityId,
          attribute: t.attributeId,
        },
      };
    }

    return {
      type: 'SET_TRIPLE',
      triple: {
        entity: t.entityId,
        attribute: t.attributeId,
        value: {
          type: t.value.type,
          value: t.value.value,
        },
      },
    };
  });
}
