import { SYSTEM_IDS } from '@geogenesis/sdk';
import { describe, expect, it } from 'vitest';

import { Triple } from '~/core/types';

import { description, descriptionTriple, name, nameTriple } from './entities';

const triplesWithSystemDescriptionAttribute: Triple[] = [
  {
    id: '',
    entityId: 'entityId',
    attributeId: SYSTEM_IDS.DESCRIPTION,
    attributeName: 'Description',
    value: {
      type: 'TEXT',
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
      value: 'valueId',
      type: 'ENTITY',
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
      type: 'TEXT',
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
      value: 'valueId',
      type: 'ENTITY',
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
      type: 'TEXT',
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
      value: 'valueId',
      type: 'ENTITY',
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
      type: 'TEXT',
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
