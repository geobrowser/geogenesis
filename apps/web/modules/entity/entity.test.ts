import { describe, expect, it } from 'vitest';
import { SYSTEM_IDS } from '../constants';
import { Triple } from '../types';
import { description } from './entity';

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
      type: 'string',
      value: 'banana',
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
  it('Parses description from triples where description attribute is the the expected system Description', () => {
    expect(description(triplesWithSystemDescriptionAttribute)).toBe('banana');
  });

  it('Parses description from triples where description is the expected system Description and value is a reference to another Entity', () => {
    expect(description(triplesWithSystemDescriptionAttributeAndValueIsEntity)).toBe(null);
  });

  it('Parses description from triples where description is not the expected system Description', () => {
    expect(description(triplesWithNonSystemDescriptionAttribute)).toBe('banana');
  });

  it('Parses description from triples where description is not the expected system Description and value is a reference to another Entity', () => {
    expect(description(triplesWithNonSystemDescriptionAttributeAndValueIsEntity)).toBe(null);
  });
});
