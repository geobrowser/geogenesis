import { SYSTEM_IDS } from '@geogenesis/ids';
import { describe, expect, it } from 'vitest';

import { Action, Entity, Triple } from '../../types';
import {
  description,
  descriptionTriple,
  entitiesFromTriples,
  mergeActionsWithEntities,
  name,
  nameTriple,
  types,
} from './entity';

const triplesWithSystemDescriptionAttribute: Triple[] = [
  {
    id: '',
    entityId: 'entityId',
    attributeId: SYSTEM_IDS.DESCRIPTION,
    attributeName: 'Description',
    value: {
      id: 'valueId',
      type: 'string',
      value: 'banana',
    },
    space: 'spaceId',
    entityName: 'banana',
  },
];

const triplesWithSystemDescriptionAttributeAndValueIsEntity: Triple[] = [
  {
    id: '',
    entityId: 'entityId',
    attributeId: SYSTEM_IDS.DESCRIPTION,
    attributeName: 'Description',
    value: {
      id: 'valueId',
      type: 'entity',
      name: 'banana',
    },
    space: 'spaceId',
    entityName: 'banana',
  },
];

const triplesWithNonSystemDescriptionAttribute: Triple[] = [
  {
    id: '',
    entityId: 'entityId',
    attributeId: 'attributeId',
    attributeName: 'Description',
    value: {
      id: 'valueId',
      type: 'string',
      value: 'banana',
    },
    space: 'spaceId',
    entityName: 'banana',
  },
];

const triplesWithNonSystemDescriptionAttributeAndValueIsEntity: Triple[] = [
  {
    id: '',
    entityId: 'entityId',
    attributeId: 'attributeId',
    attributeName: 'Description',
    value: {
      id: 'valueId',
      type: 'entity',
      name: 'banana',
    },
    space: 'spaceId',
    entityName: 'banana',
  },
];

/**
 * We assume that the Description triple's attribute for an Entity will match the expected
 * system Description attribute ID at SYSTEM_IDS.DESCRIPTION. However, anybody can
 * set up a triple that references _any_ attribute whose name is "Description."
 *
 * We currently handle this in the UI by checking the system ID for Description as well
 * as _any_ attribute whose name is "Description."
 *
 * We currently don't handle description triples whose value is an EntityValue that references
 * some other entity.
 */
describe('Entity description helpers', () => {
  it('Entity.description should parse description from triples where description attribute is the the expected system Description', () => {
    expect(description(triplesWithSystemDescriptionAttribute)).toBe('banana');
  });

  it('Entity.description should return null where description is the expected system Description and value is a reference to another Entity', () => {
    expect(description(triplesWithSystemDescriptionAttributeAndValueIsEntity)).toBe(null);
  });

  it('Entity.description should parse description from triples where description is not the expected system Description', () => {
    expect(description(triplesWithNonSystemDescriptionAttribute)).toBe('banana');
  });

  it('Entity.description should return null where description is not the expected system Description and value is a reference to another Entity', () => {
    expect(description(triplesWithNonSystemDescriptionAttributeAndValueIsEntity)).toBe(null);
  });

  it('Entity.descriptionTriple should return the Description triple', () => {
    expect(descriptionTriple(triplesWithSystemDescriptionAttribute)).toBe(triplesWithSystemDescriptionAttribute[0]);
  });

  it('Entity.descriptionTriple should return undefined if there is no Description triple', () => {
    expect(descriptionTriple([])).toBe(undefined);
  });
});

const triplesWithSystemNameAttribute: Triple[] = [
  {
    id: '',
    entityId: 'entityId',
    attributeId: SYSTEM_IDS.NAME,
    attributeName: 'Name',
    entityName: 'banana',
    space: 'spaceId',
    value: {
      id: 'valueId',
      type: 'string',
      value: 'banana',
    },
  },
];

const triplesWithSystemNameAttributeAndNameIsEntity: Triple[] = [
  {
    id: '',
    entityId: 'entityId',
    attributeId: SYSTEM_IDS.NAME,
    attributeName: 'Name',
    entityName: 'banana',
    space: 'spaceId',
    value: {
      id: 'valueId',
      type: 'entity',
      name: 'banana',
    },
  },
];

const triplesWithNonSystemNameAttribute: Triple[] = [
  {
    id: '',
    entityId: 'entityId',
    attributeId: 'not-name',
    attributeName: 'Name',
    entityName: 'banana',
    space: 'spaceId',
    value: {
      id: 'valueId',
      type: 'string',
      value: 'banana',
    },
  },
];

describe('Entity name helpers', () => {
  it('Entity.name should parse name from triples where name attribute is the the expected system Name', () => {
    expect(name(triplesWithSystemNameAttribute)).toBe('banana');
  });

  it('Entity.name should parse name from triples where name is the expected system Name and value is a reference to another Entity', () => {
    expect(name(triplesWithSystemNameAttributeAndNameIsEntity)).toBe(null);
  });

  it('Entity.name should return null where name is not the expected system Name', () => {
    expect(name(triplesWithNonSystemNameAttribute)).toBe(null);
  });

  it('Entity.nameTriple should return the Name triple', () => {
    expect(nameTriple(triplesWithSystemNameAttribute)).toBe(triplesWithSystemNameAttribute[0]);
  });

  it('Entity.nameTriple should return undefined if there is no Name triple', () => {
    expect(nameTriple([])).toBe(undefined);
  });
});

const triplesWithMultipleTypesFromSameSpace: Triple[] = [
  {
    id: '',
    entityId: 'entityId',
    attributeId: 'type',
    attributeName: 'Types',
    value: {
      id: 'valueId',
      type: 'entity',
      name: 'banana',
    },
    space: 'spaceId',
    entityName: 'apple',
  },
  {
    id: '',
    entityId: 'entityId',
    attributeId: 'type',
    attributeName: 'Types',
    value: {
      id: 'valueId',
      type: 'entity',
      name: 'orange',
    },
    space: 'spaceId',
    entityName: 'apple',
  },
];

const triplesWithConflictingTypesFromDifferentSpaces: Triple[] = [
  {
    id: '',
    entityId: 'entityId',
    attributeId: 'type',
    attributeName: 'Types',
    value: {
      id: 'valueId',
      type: 'entity',
      name: 'banana',
    },
    space: 'spaceId',
    entityName: 'apple',
  },
  {
    id: '',
    entityId: 'entityId',
    attributeId: 'type',
    attributeName: 'Types',
    value: {
      id: 'valueId',
      type: 'entity',
      name: 'banana',
    },
    space: 'spaceId-2',
    entityName: 'apple',
  },
];

describe('Entity types helpers', () => {
  it('Entity.types should parse types from triples assigned to Entity', () => {
    expect(types(triplesWithMultipleTypesFromSameSpace, 'spaceId')).toEqual([
      { id: 'valueId', name: 'banana' },
      { id: 'valueId', name: 'orange' },
    ]);
  });

  // See the comment in entity.ts for more details on when this happens
  it('Entity.types should parse only the types from the current space', () => {
    expect(types(triplesWithConflictingTypesFromDifferentSpaces, 'spaceId')).toEqual([
      { id: 'valueId', name: 'banana' },
    ]);
  });
});

const triplesFromMultipleEntities: Triple[] = [
  {
    id: 'entityId-1-name',
    entityId: 'entityId-1',
    attributeId: SYSTEM_IDS.NAME,
    attributeName: 'Name',
    value: {
      id: 'valueId',
      type: 'string',
      value: 'entity-1',
    },
    space: 'spaceId',
    entityName: 'entity-1',
  },
  {
    id: 'entityId-1-description',
    entityId: 'entityId-1',
    attributeId: SYSTEM_IDS.DESCRIPTION,
    attributeName: SYSTEM_IDS.DESCRIPTION,
    value: {
      id: 'valueId',
      type: 'string',
      value: 'banana description',
    },
    space: 'spaceId',
    entityName: 'entity-1',
  },
  {
    id: 'entityId-2-name',
    entityId: 'entityId-2',
    attributeId: SYSTEM_IDS.NAME,
    attributeName: 'Name',
    value: {
      id: 'valueId',
      type: 'string',
      value: 'entity-2',
    },
    space: 'spaceId',
    entityName: 'entity-2',
  },
  {
    id: 'entityId-1-description',
    entityId: 'entityId-2',
    attributeId: SYSTEM_IDS.DESCRIPTION,
    attributeName: SYSTEM_IDS.DESCRIPTION,
    value: {
      id: 'valueId',
      type: 'string',
      value: 'apple description',
    },
    space: 'spaceId',
    entityName: 'entity-2',
  },
];

it('Entity.entitiesFromTriples should map Triples to Entity', () => {
  const entitiesResult: Entity[] = [
    {
      id: 'entityId-1',
      name: 'entity-1',
      description: 'banana description',
      types: [],
      nameTripleSpace: 'spaceId',
      triples: [triplesFromMultipleEntities[0], triplesFromMultipleEntities[1]],
    },
    {
      id: 'entityId-2',
      name: 'entity-2',
      description: 'apple description',
      types: [],
      nameTripleSpace: 'spaceId',
      triples: [triplesFromMultipleEntities[2], triplesFromMultipleEntities[3]],
    },
  ];

  expect(entitiesFromTriples(triplesFromMultipleEntities)).toEqual(entitiesResult);
});

const localActions: Record<string, Action[]> = {
  spaceId: [
    {
      type: 'editTriple',
      before: {
        type: 'deleteTriple',
        ...triplesFromMultipleEntities[0],
      },
      after: {
        type: 'createTriple',
        ...triplesFromMultipleEntities[0],
        value: {
          id: 'valueId',
          type: 'string',
          value: 'entity-1-changed',
        },
      },
    },
  ],
};

const networkEntities: Entity[] = [
  {
    id: 'entityId-1',
    name: 'entity-1',
    description: 'banana description',
    types: [],
    triples: [triplesFromMultipleEntities[0], triplesFromMultipleEntities[1]],
  },
];

it('Entity.mergeActionsWithNetworkEntities should merge local actions with entities', () => {
  expect(mergeActionsWithEntities(localActions, networkEntities)).toStrictEqual([
    {
      id: 'entityId-1',
      name: 'entity-1-changed',
      description: 'banana description',
      types: [],
      nameTripleSpace: 'spaceId',
      triples: [
        {
          type: 'createTriple',
          id: 'entityId-1-name',
          entityId: 'entityId-1',
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          value: {
            id: 'valueId',
            type: 'string',
            value: 'entity-1-changed',
          },
          space: 'spaceId',
          entityName: 'entity-1',
        },
        triplesFromMultipleEntities[1],
      ],
    },
  ]);
});
