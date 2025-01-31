import { SYSTEM_IDS } from '@geogenesis/sdk';
import { describe, expect, it } from 'vitest';

import { queryStringFromFilters } from './to-query-string';

describe('to-query-string', () => {
  it('Builds a graphql query from table block filters', () => {
    const stringFilter = queryStringFromFilters([
      {
        columnId: 'type',
        value: 'Value 1',
        valueType: 'TEXT',
      },
    ]);

    expect(stringFilter).toEqual(
      `triples: { some: { attributeId: { equalTo: "type" }, textValue: { equalToInsensitive: "Value 1"} } }`
    );

    const entityFilter = queryStringFromFilters([
      {
        columnId: 'type',
        value: 'id 1',
        valueType: 'RELATION',
      },
    ]);

    // Don't support relation filters in the query yet
    expect(entityFilter).toEqual(`and: []`);

    const nameFilter = queryStringFromFilters([
      {
        columnId: SYSTEM_IDS.NAME_ATTRIBUTE,
        value: 'id 1',
        valueType: 'TEXT',
      },
    ]);

    expect(nameFilter).toEqual(`name: { startsWithInsensitive: "id 1" }`);

    const andFilter = queryStringFromFilters([
      {
        columnId: SYSTEM_IDS.TYPES_ATTRIBUTE,
        value: 'Value 1',
        valueType: 'RELATION',
      },
      {
        columnId: SYSTEM_IDS.NAME_ATTRIBUTE,
        value: 'id 1',
        valueType: 'TEXT',
      },
    ]);

    expect(andFilter).toEqual(
      `and: [{ versionTypes: { some: { type: { entityId: {equalTo: "Value 1" } } } } }, { name: { startsWithInsensitive: "id 1" } }]`
    );

    const spaceFilter = queryStringFromFilters([
      {
        columnId: SYSTEM_IDS.SPACE_FILTER,
        valueType: 'TEXT',
        value: '0x0000000000000000000000000000000000000000',
      },
    ]);

    expect(spaceFilter).toEqual(
      `versionSpaces: {
        some: {
          spaceId: { equalTo: "0x0000000000000000000000000000000000000000" }
        }
      }`
    );

    const nullTypeIdFilter = queryStringFromFilters([]);

    expect(nullTypeIdFilter).toEqual('');
  });

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
        columnId: SYSTEM_IDS.NAME_ATTRIBUTE,
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
        columnId: SYSTEM_IDS.NAME_ATTRIBUTE,
        value: 'id 1',
        valueType: 'TEXT',
      },
    ]);

    expect(andFilter).toMatchSnapshot();

    const spaceFilter = queryStringFromFilters([
      {
        columnId: SYSTEM_IDS.SPACE_FILTER,
        valueType: 'TEXT',
        value: '0x0000000000000000000000000000000000000000',
      },
    ]);

    expect(spaceFilter).toMatchSnapshot();

    const nullTypeIdFilter = queryStringFromFilters([]);

    expect(nullTypeIdFilter).toEqual('');
  });
});
