import { SystemIds } from '@graphprotocol/grc-20';
import { describe, expect, it } from 'vitest';

import { FilterString, fromGeoFilterState } from './filters';

describe('filters', () => {
  it('Builds the TableBlockStore filters data structure from the Geo filter string', async () => {
    const filter: FilterString = {
      where: {
        spaces: ['0x0000000000000000000000000000000000000000'],
        AND: [
          {
            attribute: SystemIds.TYPES_ATTRIBUTE,
            is: SystemIds.SCHEMA_TYPE,
          },
          {
            attribute: SystemIds.NAME_ATTRIBUTE,
            is: 'name',
          },
        ],
      },
    };

    const stringFilter = await fromGeoFilterState(JSON.stringify(filter));

    expect(stringFilter).toEqual([
      {
        columnId: SystemIds.SPACE_FILTER,
        value: '0x0000000000000000000000000000000000000000',
        columnName: 'Space',
        valueType: 'RELATION',
        valueName: null,
      },
      {
        columnId: SystemIds.TYPES_ATTRIBUTE,
        columnName: 'Types',
        value: SystemIds.SCHEMA_TYPE,
        valueType: 'RELATION',
        valueName: 'Type',
      },
      {
        columnId: SystemIds.NAME_ATTRIBUTE,
        columnName: 'Name',
        value: 'name',
        valueType: 'TEXT',
        valueName: null,
      },
    ]);
  });

  // @TODO: test for going from app state to Geo filter string
});
