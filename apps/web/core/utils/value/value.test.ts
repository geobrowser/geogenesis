import { describe, expect, it } from 'vitest';

import { Triple } from '../../types';
import { nameOfEntityValue } from './value';

const entityValueTriple: Triple = {
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
};

const entityValueTripleWithNoEntity: Triple = {
  id: '',
  entityId: 'entityId',
  attributeId: 'attributeId',
  attributeName: 'Description',
  value: {
    id: '',
    type: 'entity',
    name: null,
  },
  space: 'spaceId',
  entityName: 'banana',
};

const stringValueTriple: Triple = {
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
};

describe('Value helpers', () => {
  it('Value.entityName should return the name of an EntityValue', () => {
    expect(nameOfEntityValue(entityValueTriple)).toBe('banana');
  });

  it('Value.entityName should return null if the EntityValue is empty', () => {
    expect(nameOfEntityValue(entityValueTripleWithNoEntity)).toBe(null);
  });

  it('Value.entityName should return null if it is not an EntityValue or the EntityValue is empty', () => {
    expect(nameOfEntityValue(stringValueTriple)).toBe(null);
  });
});
