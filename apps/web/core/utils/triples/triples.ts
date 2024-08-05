import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Op } from '@geogenesis/sdk';
import { A, pipe } from '@mobily/ts-belt';

import { ID } from '~/core/id';
import { getAppTripleId } from '~/core/id/create-id';
import {
  AppEntityValue,
  CollectionItem,
  OmitStrict,
  Triple,
  ValueType as TripleValueType,
  Value,
  ValueTypeId,
} from '~/core/types';
import { valueTypes } from '~/core/value-types';

import { Collections } from '../collections';
import { Entities } from '../entity';

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
    NUMBER: {
      type: 'NUMBER',
      value: '',
    },
    IMAGE: {
      type: 'IMAGE',
      value: '',
      image: '',
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

/**
 * This would be a lot easier as a local first representation with the same  model both
 * for query time merging and ad-hoc runtime merging of the two triples sources.
 */
export function merge(local: Triple[], remote: Triple[]): Triple[] {
  const localTripleIds = new Set(local.map(t => t.id));
  const remoteTriplesWithoutLocalTriples = remote.filter(t => !localTripleIds.has(getAppTripleId(t, t.space)));
  const remoteTriplesMappedToLocalTriples = remoteTriplesWithoutLocalTriples.map(t => ({
    ...t,

    hasBeenPublished: false,
    isDeleted: false,
    placeholder: false,
    id: getAppTripleId(t, t.space),
    timestamp: timestamp(),
  }));

  const triples = [...remoteTriplesMappedToLocalTriples, ...local];

  return triples;
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
    case 'URI':
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

    // We store image entities as an `IMAGE` value type in the app to make
    // rendering them more ergonomic. Before publishing we need to map this
    // representation back to the protocol's expectation representation for
    // images which is an `ENTITY` value type.
    if (t.value.type === 'IMAGE') {
      return {
        type: 'SET_TRIPLE',
        triple: {
          entity: t.entityId,
          attribute: t.attributeId,
          value: {
            type: 'ENTITY',
            value: t.value.value,
          },
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
