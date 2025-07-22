import { SystemIds } from '@graphprotocol/grc-20';
import { describe, expect, it } from 'vitest';

import { Triple } from '~/core/types';

import { description, descriptionTriple, name, nameTriple } from './entities';

const triplesWithSystemDescriptionAttribute: Triple[] = [
  {
    id: '',
    entityId: 'entityId',
    attributeId: SystemIds.DESCRIPTION_ATTRIBUTE,
    attributeName: 'Description',
    value: {
      type: 'TEXT',
      value: 'banana',
    },
    space: 'spaceId',
    entityName: 'banana',
  },
];

/**
 * We assume that the Description triple's attribute for an Entity will match the expected
 * system Description attribute ID at SystemIds.DESCRIPTION_ATTRIBUTE. However, anybody can
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
    attributeId: SystemIds.NAME_ATTRIBUTE,
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

  it('Entity.nameTriple should return the Name triple', () => {
    expect(nameTriple(triplesWithSystemNameAttribute)).toBe(triplesWithSystemNameAttribute[0]);
  });

  it('Entity.nameTriple should return undefined if there is no Name triple', () => {
    expect(nameTriple([])).toBe(undefined);
  });
});
