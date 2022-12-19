import { describe, it } from 'vitest';
import { Triple as TripleType } from '../types';
import { empty, withId } from './triple';

describe('Triple', () => {
  it('Returns the same triple with an ID', () => {
    const triple: TripleType = {
      id: '',
      entityId: 'entityId',
      attributeId: 'attributeId',
      attributeName: 'banana',
      value: {
        id: 'valueId',
        type: 'string',
        value: 'banana',
      },
      space: 'spaceId',
      entityName: 'banana',
    };

    expect(withId(triple)).toEqual({
      ...triple,
      id: 'spaceId:entityId:attributeId:valueId',
    });
  });

  it('Returns an empty triple', () => {
    expect(empty('banana-id')).toEqual({
      id: '',
      entityId: 'banana-id',
      attributeId: '',
      attributeName: '',
      value: {
        id: '',
        type: 'string',
        value: '',
      },
      space: '',
      entityName: '',
    });
  });
});
