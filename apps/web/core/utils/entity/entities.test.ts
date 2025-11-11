import { SystemIds } from '@graphprotocol/grc-20';
import { describe, expect, it } from 'vitest';

import { Value } from '~/core/v2.types';

import { description, descriptionTriple, name, nameValue } from './entities';

const valuesWithSystemDescriptionAttribute: Value[] = [
  {
    id: 'value-id',
    entity: {
      id: 'entityId',
      name: 'banana',
    },
    property: {
      id: SystemIds.DESCRIPTION_PROPERTY,
      name: 'Description',
      dataType: 'TEXT',
    },
    value: 'banana',
    spaceId: 'spaceId',
  },
];

/**
 * We assume that the Description value's property for an Entity will match the expected
 * system Description property ID at SystemIds.DESCRIPTION_PROPERTY. However, anybody can
 * set up a value that references _any_ property whose name is "Description."
 *
 * We currently handle this in the UI by checking the system ID for Description as well
 * as _any_ property whose name is "Description."
 *
 * We currently don't handle description values whose value is an EntityValue that references
 * some other entity.
 */
describe('Entity description helpers', () => {
  it('Entity.description should parse description from values where description property is the expected system Description', () => {
    expect(description(valuesWithSystemDescriptionAttribute)).toBe('banana');
  });

  it('Entity.descriptionTriple should return the Description value', () => {
    expect(descriptionTriple(valuesWithSystemDescriptionAttribute)).toBe(valuesWithSystemDescriptionAttribute[0]);
  });

  it('Entity.descriptionTriple should return undefined if there is no Description value', () => {
    expect(descriptionTriple([])).toBe(undefined);
  });
});

const valuesWithSystemNameAttribute: Value[] = [
  {
    id: 'value-id',
    entity: {
      id: 'entityId',
      name: 'banana',
    },
    property: {
      id: SystemIds.NAME_PROPERTY,
      name: 'Name',
      dataType: 'TEXT',
    },
    value: 'banana',
    spaceId: 'spaceId',
  },
];

describe('Entity name helpers', () => {
  it('Entity.name should parse name from values where name property is the expected system Name', () => {
    expect(name(valuesWithSystemNameAttribute)).toBe('banana');
  });

  it('Entity.nameValue should return the Name value', () => {
    expect(nameValue(valuesWithSystemNameAttribute)).toBe(valuesWithSystemNameAttribute[0]);
  });

  it('Entity.nameValue should return undefined if there is no Name value', () => {
    expect(nameValue([])).toBe(undefined);
  });
});
