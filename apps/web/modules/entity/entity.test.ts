import { describe, expect, it } from 'vitest';
import { SYSTEM_IDS } from '../constants';
import { NetworkEntity } from '../services/network';
import { Triple } from '../types';
import { networkStringDescriptionValue, stringOrEntityDescriptionValue } from './entity';

const triplesWithScalarDescription: Triple[] = [
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

const triplesWithEntityDescription: Triple[] = [
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

// A triple may be referencing a Description different from the expected
// system one.
const networkTriplesWithDescriptionName: NetworkEntity['entityOf'] = [
  {
    attribute: {
      id: 'attributeId',
      name: 'Description',
    },
    stringValue: 'banana',
    valueType: 'STRING',
  },
];

const networkTriplesWithDescriptionId: NetworkEntity['entityOf'] = [
  {
    attribute: {
      id: SYSTEM_IDS.DESCRIPTION_SCALAR,
      name: '',
    },
    stringValue: 'banana',
    valueType: 'STRING',
  },
];

const networkTriplesWithDescriptionAsEntityValue: NetworkEntity['entityOf'] = [
  {
    attribute: {
      id: SYSTEM_IDS.DESCRIPTION_SCALAR,
      name: '',
    },
    entityValue: {
      id: 'entityId',
      name: 'banana',
    },
    valueType: 'ENTITY',
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
  it('Parses description from triples where description is an stringValue', () => {
    expect(stringOrEntityDescriptionValue(triplesWithScalarDescription)).toBe('banana');
  });

  it('Parses description from triples where description is an stringValue', () => {
    expect(stringOrEntityDescriptionValue(triplesWithEntityDescription)).toBe('banana');
  });

  it('Parses description from network GeoEntity where description attribute is not the expected system Description', () => {
    expect(networkStringDescriptionValue(networkTriplesWithDescriptionName)).toBe('banana');
  });

  it('Parses description from network GeoEntity where description attribute is the expected system Description', () => {
    expect(networkStringDescriptionValue(networkTriplesWithDescriptionId)).toBe('banana');
  });

  it('Returns undefined from network GeoEntity where description value is a reference to another Entity', () => {
    expect(networkStringDescriptionValue(networkTriplesWithDescriptionAsEntityValue)).toBe(undefined);
  });
});
