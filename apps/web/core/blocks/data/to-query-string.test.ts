import { SystemIds } from '@graphprotocol/grc-20';
import { describe, expect, it } from 'vitest';

import { queryStringFromFilters } from './to-query-string';

describe('to-query-string', () => {
  it('Builds a graphql query from table block filters for the postgraphile-based substreams API', () => {
    const stringFilter = queryStringFromFilters([
      {
        columnId: 'type',
        value: 'Value 1',
        valueType: 'TEXT',
      },
    ]);

    expect(stringFilter).toMatchSnapshot();

    const entityFilter = queryStringFromFilters([
      {
        columnId: 'type',
        value: 'id 1',
        valueType: 'RELATION',
      },
    ]);

    expect(entityFilter).toMatchSnapshot();

    const nameFilter = queryStringFromFilters([
      {
        columnId: SystemIds.NAME_PROPERTY,
        value: 'id 1',
        valueType: 'TEXT',
      },
    ]);

    expect(nameFilter).toMatchSnapshot();

    const andFilter = queryStringFromFilters([
      {
        columnId: 'type',
        value: 'Value 1',
        valueType: 'TEXT',
      },
      {
        columnId: 'type',
        value: 'id 1',
        valueType: 'RELATION',
      },
      {
        columnId: SystemIds.NAME_PROPERTY,
        value: 'id 1',
        valueType: 'TEXT',
      },
    ]);

    expect(andFilter).toMatchSnapshot();

    const spaceFilter = queryStringFromFilters([
      {
        columnId: SystemIds.SPACE_FILTER,
        valueType: 'TEXT',
        value: '0x0000000000000000000000000000000000000000',
      },
    ]);

    expect(spaceFilter).toMatchSnapshot();

    const nullTypeIdFilter = queryStringFromFilters([]);

    expect(nullTypeIdFilter).toEqual('');
  });
});
