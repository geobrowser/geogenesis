import { SYSTEM_IDS } from '@geogenesis/sdk';
import { describe, expect, it } from 'vitest';

import { FilterString, fromGeoFilterState } from './filters';

describe('filters', () => {
  it('Builds the TableBlockStore filters data structure from the Geo filter string', async () => {
    const filter: FilterString = {
      where: {
        spaces: ['0x0000000000000000000000000000000000000000'],
        AND: [
          {
            attribute: SYSTEM_IDS.TYPES_ATTRIBUTE,
            is: SYSTEM_IDS.SCHEMA_TYPE,
          },
          {
            attribute: SYSTEM_IDS.NAME_ATTRIBUTE,
            is: 'name',
          },
        ],
      },
    };

    const stringFilter = await fromGeoFilterState(JSON.stringify(filter));

    expect(stringFilter).toEqual([
      {
        columnId: SYSTEM_IDS.SPACE_FILTER,
        value: '0x0000000000000000000000000000000000000000',
        valueType: 'RELATION',
        valueName: null,
      },
      {
        columnId: SYSTEM_IDS.TYPES_ATTRIBUTE,
        value: SYSTEM_IDS.SCHEMA_TYPE,
        valueType: 'RELATION',
        valueName: 'Type',
      },
      {
        columnId: SYSTEM_IDS.NAME_ATTRIBUTE,
        value: 'name',
        valueType: 'TEXT',
        valueName: null,
      },
    ]);
  });

  // @TODO: test for going from app state to Geo filter string
});
