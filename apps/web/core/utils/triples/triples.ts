import { Op } from '@geogenesis/sdk';

import { StoredTriple } from '~/core/database/types';
import { ID } from '~/core/id';
import { getAppTripleId } from '~/core/id/create-id';
import { OmitStrict, Triple, ValueType as TripleValueType, Value } from '~/core/types';

export function withId(triple: OmitStrict<Triple, 'id'>): Triple {
  return {
    ...triple,
    id: ID.createTripleId(triple),
  };
}

export function timestamp() {
  return new Date().toISOString();
}

export function emptyValue(type: TripleValueType): Value {
  const tripleValue: Record<TripleValueType, Value> = {
    TEXT: {
      type: 'TEXT',
      value: '',
    },
    ENTITY: {
      type: 'ENTITY',
      value: '',
      name: null,
    },
    TIME: {
      type: 'TIME',
      value: '',
    },
    URI: {
      type: 'URI',
      value: '',
    },
    CHECKBOX: {
      type: 'CHECKBOX',
      value: '0',
    },
  };

  return tripleValue[type];
}

// New, empty triples should generate unique triple IDs so they are distinguishable from
// other newly created triples locally.
export function empty(spaceId: string, entityId: string, type: TripleValueType = 'TEXT'): Triple {
  const emptyTriple: OmitStrict<Triple, 'id'> = {
    entityId: entityId,
    attributeId: '',
    attributeName: '',
    value: emptyValue(type),
    space: spaceId,
    entityName: '',
  };

  return {
    ...emptyTriple,
    id: ID.createTripleId(emptyTriple),
  };
}

export function merge(local: StoredTriple[], remote: Triple[]): StoredTriple[] {
  const localTripleIds = new Set(local.map(t => t.id));
  const remoteTriplesWithoutLocalTriples = remote.filter(t => !localTripleIds.has(getAppTripleId(t, t.space)));
  const remoteTriplesMappedToLocalTriples = remoteTriplesWithoutLocalTriples.map(t => ({
    ...t,
    hasBeenPublished: false,
    isDeleted: false,
    id: getAppTripleId(t, t.space),
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
