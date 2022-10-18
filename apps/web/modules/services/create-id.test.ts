import { describe, expect, it } from 'vitest';
import { EntityValue, NumberValue, StringValue } from '../types';
import { createTripleId } from './create-id';

describe('create-id', () => {
  it('createTripleId returns correct id derived from triple with string value', () => {
    const entityId = 'entityId';
    const attributeId = 'attributeId';
    const value = { type: 'string', value: 'Jesus Christ' } as StringValue;
    expect(createTripleId('', entityId, attributeId, value)).toBe(':entityId:attributeId:s~Jesus Christ');
  });

  it('createTripleId returns correct id derived from triple with number value', () => {
    const entityId = 'entityId';
    const attributeId = 'attributeId';
    const value = { type: 'number', value: '1920' } as NumberValue;
    expect(createTripleId('', entityId, attributeId, value)).toBe(':entityId:attributeId:n~1920');
  });

  it('createTripleId returns correct id derived from triple with entity value', () => {
    const entityId = 'entityId';
    const attributeId = 'attributeId';
    const value = { type: 'entity', value: '12387' } as EntityValue;
    expect(createTripleId('', entityId, attributeId, value)).toBe(':entityId:attributeId:e~12387');
  });
});
