import { describe, expect, it } from 'vitest';
import { SYSTEM_IDS } from '../constants';
import { Triple } from '../types';
import { description, types } from './entity';

const triplesWithSystemDescriptionAttribute: Triple[] = [
  {
    id: '',
    entityId: 'entityId',
    attributeId: SYSTEM_IDS.DESCRIPTION_SCALAR,
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
    attributeId: SYSTEM_IDS.DESCRIPTION_SCALAR,
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
 * system Description attribute ID at SYSTEM_IDS.DESCRIPTION_SCALAR. However, anybody can
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

  it('Entity.description should parse description from triples where description is the expected system Description and value is a reference to another Entity', () => {
    expect(description(triplesWithSystemDescriptionAttributeAndValueIsEntity)).toBe(null);
  });

  it('Entity.description should parse description from triples where description is not the expected system Description', () => {
    expect(description(triplesWithNonSystemDescriptionAttribute)).toBe('banana');
  });

  it('Entity.description should parse description from triples where description is not the expected system Description and value is a reference to another Entity', () => {
    expect(description(triplesWithNonSystemDescriptionAttributeAndValueIsEntity)).toBe(null);
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
    expect(types(triplesWithMultipleTypesFromSameSpace, 'spaceId')).toEqual(['banana', 'orange']);
  });

  // See the comment in entity.ts for more details on when this happens
  it('Entity.types should parse only the types from the current space', () => {
    expect(types(triplesWithConflictingTypesFromDifferentSpaces, 'spaceId')).toEqual(['banana']);
  });
});
