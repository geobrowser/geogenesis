import { Op } from '@geobrowser/gdk';
import { A, pipe } from '@mobily/ts-belt';

import { StoredTriple } from '~/core/database/types';
import { ID } from '~/core/id';
import { getAppTripleId } from '~/core/id/create-id';
import { AppEntityValue, OmitStrict, Triple, ValueType as TripleValueType, Value } from '~/core/types';

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
    } as AppEntityValue,
    TIME: {
      type: 'TIME',
      value: '',
    },
    URI: {
      type: 'URI',
      value: '',
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

/**
 * This would be a lot easier as a local first representation with the same  model both
 * for query time merging and ad-hoc runtime merging of the two triples sources.
 */
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

/**
 * This function applies locally changed entity names to all triples being rendered.
 */
export function withLocalNames(appTriples: Triple[], triples: Triple[]): Triple[] {
  const newEntityNames = pipe(
    appTriples,
    A.reduce({} as Record<string, string>, (acc, entity) => {
      if (entity.entityName) acc[entity.entityId] = entity.entityName;
      return acc;
    })
  );

  return A.map(triples, triple => {
    const newTriple = { ...triple };

    // The triple is part of the entity whose name changed
    if (newEntityNames[triple.entityId]) {
      newTriple.entityName = newEntityNames[triple.entityId];
    }

    // The triple has an attribute whose name changed
    if (newEntityNames[triple.attributeId]) {
      newTriple.attributeName = newEntityNames[triple.attributeId];
    }

    // The triple has a an entity value whose name changed
    if (newEntityNames[triple.value.value]) {
      newTriple.value = {
        ...triple.value,
        name: newEntityNames[triple.value.value],
      } as AppEntityValue;
    }

    return newTriple;
  });
}

export const getValue = (triple: Triple): string | null => {
  switch (triple.value.type) {
    case 'TEXT':
    case 'ENTITY':
    case 'TIME':
    case 'URI':
      return triple.value.value;
  }
};

export function prepareTriplesForPublishing(triples: Triple[], spaceId: string): Op[] {
  const triplesToPublish = triples.filter(
    t => t.space === spaceId && !t.hasBeenPublished && t.attributeId !== '' && t.entityId !== '' && t.value.value !== ''
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
