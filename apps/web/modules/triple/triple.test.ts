import { describe, it } from 'vitest';

import { SYSTEM_IDS } from '~/../../packages/ids';
import { Action as ActionType, Triple as TripleType } from '../types';
import { empty, withId, withLocalNames } from './triple';

describe('Triple helpers', () => {
  it('Triple.withId returns the same triple with an updated ID', () => {
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

  it('Triple.empty returns a unique, empty triple', () => {
    expect(empty('space-id', 'banana-id')).not.toEqual(empty('space-id', 'banana-id'));
  });

  it('Triple.withLocalNames returns triples whose entity names have been changed locally', () => {
    const tripleInEntity: TripleType = {
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

    const editAction: ActionType = {
      type: 'editTriple',
      before: {
        type: 'deleteTriple',
        id: 'before',
        entityId: 'entityId',
        attributeId: SYSTEM_IDS.NAME,
        attributeName: 'Name',
        value: {
          id: 'valueId',
          type: 'string',
          value: 'name-1',
        },
        space: 'spaceId',
        entityName: 'entityName',
      },
      after: {
        type: 'createTriple',
        id: 'before',
        entityId: 'entityId',
        attributeId: SYSTEM_IDS.NAME,
        attributeName: 'Name',
        value: {
          id: 'valueId',
          type: 'string',
          value: 'name-2',
        },
        space: 'spaceId',
        entityName: 'name-2',
      },
    };

    expect(withLocalNames([editAction], [tripleInEntity])).toStrictEqual([
      {
        ...tripleInEntity,
        entityName: 'name-2',
      },
    ]);

    const tripleWithEntityInAttribute: TripleType = {
      id: '',
      entityId: 'someOtherEntityId',
      attributeId: 'entityId',
      attributeName: 'entityName',
      value: {
        id: 'valueId',
        type: 'string',
        value: 'banana',
      },
      space: 'spaceId',
      entityName: 'banana',
    };

    expect(withLocalNames([editAction], [tripleWithEntityInAttribute])).toStrictEqual([
      {
        ...tripleWithEntityInAttribute,
        attributeName: 'name-2',
      },
    ]);

    const tripleWithEntityInValue: TripleType = {
      id: '',
      entityId: 'someOtherEntityName',
      attributeId: 'attirbuteId',
      attributeName: 'attributeName',
      value: {
        id: 'entityId',
        type: 'entity',
        name: 'valueName',
      },
      space: 'spaceId',
      entityName: 'entityName',
    };

    expect(withLocalNames([editAction], [tripleWithEntityInValue])).toStrictEqual([
      {
        ...tripleWithEntityInValue,
        value: {
          ...tripleWithEntityInValue.value,
          name: 'name-2',
        },
      },
    ]);
  });
});
