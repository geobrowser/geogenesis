import { SYSTEM_IDS } from '@geogenesis/sdk';
import { describe, expect, it } from 'vitest';

import { FilterString, createFiltersFromFilterString, createGraphQLStringFromFilters } from './table';

describe('TableBlock SDK', () => {
  it('Builds a graphql query from table block filters', () => {
    const stringFilter = createGraphQLStringFromFilters([
      {
        columnId: 'type',
        value: 'Value 1',
        valueType: 'TEXT',
      },
    ]);

    expect(stringFilter).toEqual(
      `triples: { some: { attributeId: { equalTo: "type" }, textValue: { equalToInsensitive: "Value 1"} } }`
    );

    const entityFilter = createGraphQLStringFromFilters([
      {
        columnId: 'type',
        value: 'id 1',
        valueType: 'RELATION',
      },
    ]);

    // Don't support relation filters in the query yet
    expect(entityFilter).toEqual(`and: []`);

    const nameFilter = createGraphQLStringFromFilters([
      {
        columnId: SYSTEM_IDS.NAME,
        value: 'id 1',
        valueType: 'TEXT',
      },
    ]);

    expect(nameFilter).toEqual(`name: { startsWithInsensitive: "id 1" }`);

    const andFilter = createGraphQLStringFromFilters([
      {
        columnId: SYSTEM_IDS.TYPES,
        value: 'Value 1',
        valueType: 'RELATION',
      },
      {
        columnId: SYSTEM_IDS.NAME,
        value: 'id 1',
        valueType: 'TEXT',
      },
    ]);

    expect(andFilter).toEqual(
      `and: [{ versionTypes: { some: { type: { entityId: {equalTo: "Value 1" } } } } }, { name: { startsWithInsensitive: "id 1" } }]`
    );

    const spaceFilter = createGraphQLStringFromFilters([
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

    const nullTypeIdFilter = createGraphQLStringFromFilters([]);

    expect(nullTypeIdFilter).toEqual('');
  });

  it('Builds the TableBlockStore filters data structure from the filter string', async () => {
    /**
     * There are several combinations of filters that can be applied to a table block.
     * 1. String field with a string value
     * 2. Entity field with an entity ID as the value
     * 3. String field targeting the Name column
     * 4. A null type id
     *
     * These four combinations can also be used together with an "and" filter
     */
    const filter: FilterString = {
      where: {
        spaces: ['0x0000000000000000000000000000000000000000'],
        AND: [
          {
            attribute: SYSTEM_IDS.TYPES,
            is: SYSTEM_IDS.SCHEMA_TYPE,
          },
          {
            attribute: SYSTEM_IDS.NAME,
            is: 'name',
          },
        ],
      },
    };

    const stringFilter = await createFiltersFromFilterString(JSON.stringify(filter));

    expect(stringFilter).toEqual([
      {
        columnId: SYSTEM_IDS.SPACE_FILTER,
        value: '0x0000000000000000000000000000000000000000',
        valueType: 'RELATION',
        valueName: null,
      },
      {
        columnId: SYSTEM_IDS.TYPES,
        value: SYSTEM_IDS.SCHEMA_TYPE,
        valueType: 'RELATION',
        valueName: 'Type',
      },
      {
        columnId: SYSTEM_IDS.NAME,
        value: 'name',
        valueType: 'TEXT',
        valueName: null,
      },
    ]);
  });

  it('Builds a graphql query from table block filters for the postgraphile-based substreams API', () => {
    const stringFilter = createGraphQLStringFromFilters([
      {
        columnId: 'type',
        value: 'Value 1',
        valueType: 'TEXT',
      },
    ]);

    expect(stringFilter).toMatchSnapshot();

    const entityFilter = createGraphQLStringFromFilters([
      {
        columnId: 'type',
        value: 'id 1',
        valueType: 'RELATION',
      },
    ]);

    expect(entityFilter).toMatchSnapshot();

    const nameFilter = createGraphQLStringFromFilters([
      {
        columnId: SYSTEM_IDS.NAME,
        value: 'id 1',
        valueType: 'TEXT',
      },
    ]);

    expect(nameFilter).toMatchSnapshot();

    const andFilter = createGraphQLStringFromFilters([
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
        columnId: SYSTEM_IDS.NAME,
        value: 'id 1',
        valueType: 'TEXT',
      },
    ]);

    expect(andFilter).toMatchSnapshot();

    const spaceFilter = createGraphQLStringFromFilters([
      {
        columnId: SYSTEM_IDS.SPACE_FILTER,
        valueType: 'TEXT',
        value: '0x0000000000000000000000000000000000000000',
      },
    ]);

    expect(spaceFilter).toMatchSnapshot();

    const nullTypeIdFilter = createGraphQLStringFromFilters([]);

    expect(nullTypeIdFilter).toEqual('');
  });
});
