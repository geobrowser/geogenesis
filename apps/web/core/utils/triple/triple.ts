import { SYSTEM_IDS } from '@geogenesis/ids';
import { Op } from '@geogenesis/sdk';
import { A, pipe } from '@mobily/ts-belt';

import { ID } from '~/core/id';
import { getAppTripleId } from '~/core/id/create-id';
import { AppEntityValue, OmitStrict, Triple, ValueType as TripleValueType, Value } from '~/core/types';
import { ValueTypeId, valueTypes } from '~/core/value-types';

export function withId(triple: OmitStrict<Triple, 'id'>): Triple {
  return {
    ...triple,
    id: ID.createTripleId(triple),
  };
}

export function timestamp() {
  return new Date().toISOString();
}

export function emptyPlaceholder(
  spaceId: string,
  entityId: string,
  valueTypeId: ValueTypeId = SYSTEM_IDS.TEXT
): Triple {
  const type = valueTypes[valueTypeId] ?? 'string';

  return {
    ...empty(spaceId, entityId, type),
    placeholder: true,
  };
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
    COLLECTION: {
      value: '',
      items: [],
      type: 'COLLECTION',
    },
    NUMBER: {
      type: 'NUMBER',
      value: '',
    },
    IMAGE: {
      type: 'IMAGE',
      value: '',
    },
    TIME: {
      type: 'TIME',
      value: '',
    },
    URL: {
      type: 'URL',
      value: '',
    },
    CHECKBOX: {
      type: 'CHECKBOX',
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
 * This functions acts as documentation to denote why we don't change the id of a triple
 * locally when changes are made.
 *
 * Right now if you change the contents of a triple locally -- e.g., you change the Attribute
 * or the Value of a relation -- we don't update the Triple ID locally. This is to make it easy to
 * track how triples have changed locally over time for use in change counts, diffing, and
 * squashing local actions before publishing them.
 *
 * Whenever the triple gets published to the network, the subgraph will correctly handle updating
 * the old triple with the new triple.
 */
export function ensureStableId<T extends Triple>(triple: T): T {
  return triple;
}

export function merge(local: Triple[], remote: Triple[]): Triple[] {
  const localTripleIds = new Set(local.map(t => t.id));
  const remoteTriplesWithoutLocalTriples = remote.filter(t => !localTripleIds.has(getAppTripleId(t, t.space)));

  return [
    ...remoteTriplesWithoutLocalTriples.map(t => ({
      ...t,
      hasBeenPublished: false,
      isDeleted: false,
      placeholder: false,
      id: getAppTripleId(t, t.space),
      timestamp: timestamp(),
    })),
    ...local,
  ];
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
    case 'NUMBER':
    case 'TEXT':
    case 'ENTITY':
    case 'IMAGE':
    case 'TIME':
    case 'URL':
    case 'COLLECTION':
      return triple.value.value;
    case 'IMAGE':
      return triple.value.image;
    case 'CHECKBOX':
      throw new Error('checkbox not supported');
  }
};

export function squash(triples: Triple[]): Triple[] {
  return triples;
}

export function prepareTriplesForPublishing(triples: Triple[], spaceId: string): Op[] {
  const triplesToPublish = triples.filter(t => t.space === spaceId && !t.hasBeenPublished);
  return triplesToPublish.map((t): Op => {
    if (t.isDeleted) {
      return {
        type: 'DELETE_TRIPLE',
        payload: {
          entityId: t.entityId,
          attributeId: t.attributeId,
        },
      };
    }

    return {
      type: 'SET_TRIPLE',
      payload: {
        entityId: t.entityId,
        attributeId: t.attributeId,
        value: {
          type: t.value.type,
          value: t.value.value,
        },
      },
    };
  });
}
