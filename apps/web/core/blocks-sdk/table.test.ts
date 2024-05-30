import { SYSTEM_IDS } from '@geogenesis/sdk';
import { describe, expect, it } from 'vitest';

import { MockNetworkData } from '~/core/io';

import {
  createFiltersFromGraphQLString,
  createGraphQLStringFromFilters,
  createGraphQLStringFromFiltersV2,
} from './table';

describe('TableBlock SDK', () => {
  /**
   * There are several combinations of filters that can be applied to a table block.
   * 1. String field with a string value
   * 2. Entity field with an entity ID as the value
   * 3. String field targeting the Name column
   * 4. A null type id
   *
   * These four combinations can also be used together with an "and" filter
   */
  it('Builds a graphql query from table block filters', () => {
    const stringFilter = createGraphQLStringFromFilters(
      [
        {
          columnId: 'type',
          value: 'Value 1',
          valueType: 'TEXT',
        },
      ],
      'type-id'
    );

    expect(stringFilter).toEqual(
      `{typeIds_contains_nocase: ["type-id"], entityOf_: {attribute: "type", stringValue_starts_with_nocase: "Value 1"}}`
    );

    const entityFilter = createGraphQLStringFromFilters(
      [
        {
          columnId: 'type',
          value: 'id 1',
          valueType: 'ENTITY',
        },
      ],
      'type-id'
    );

    expect(entityFilter).toEqual(
      `{typeIds_contains_nocase: ["type-id"], entityOf_: {attribute: "type", entityValue: "id 1"}}`
    );

    const nameFilter = createGraphQLStringFromFilters(
      [
        {
          columnId: SYSTEM_IDS.NAME,
          value: 'id 1',
          valueType: 'TEXT',
        },
      ],
      'type-id'
    );

    expect(nameFilter).toEqual(`{typeIds_contains_nocase: ["type-id"], name_starts_with_nocase: "id 1"}`);

    const andFilter = createGraphQLStringFromFilters(
      [
        {
          columnId: 'type',
          value: 'Value 1',
          valueType: 'TEXT',
        },
        {
          columnId: 'type',
          value: 'id 1',
          valueType: 'ENTITY',
        },
        {
          columnId: SYSTEM_IDS.NAME,
          value: 'id 1',
          valueType: 'TEXT',
        },
      ],
      'type-id'
    );

    expect(andFilter).toEqual(
      `{and: [{typeIds_contains_nocase: ["type-id"]}, {entityOf_: {attribute: "type", stringValue_starts_with_nocase: "Value 1"}}, {entityOf_: {attribute: "type", entityValue: "id 1"}}, {name_starts_with_nocase: "id 1"}]}`
    );

    const spaceFilter = createGraphQLStringFromFilters(
      [
        {
          columnId: SYSTEM_IDS.SPACE,
          valueType: 'TEXT',
          value: '0x0000000000000000000000000000000000000000',
        },
      ],
      'type-id'
    );

    expect(spaceFilter).toEqual(
      `{typeIds_contains_nocase: ["type-id"], entityOf_: {space: "0x0000000000000000000000000000000000000000"}}`
    );

    const nullTypeIdFilter = createGraphQLStringFromFilters([], null);

    expect(nullTypeIdFilter).toEqual('');
  });

  it('Builds the TableBlockStore filters data structure from a graphql string', async () => {
    /**
     * There are several combinations of filters that can be applied to a table block.
     * 1. String field with a string value
     * 2. Entity field with an entity ID as the value
     * 3. String field targeting the Name column
     * 4. A null type id
     *
     * These four combinations can also be used together with an "and" filter
     */
    const stringFilter = await createFiltersFromGraphQLString(
      `{typeIds_contains_nocase: ["type-id"], entityOf_: {attribute: "type", stringValue_starts_with_nocase: "Value 1"}}`,
      async () => {
        return {
          id: 'type',
          triples: [MockNetworkData.makeStubTriple('Types')],
          name: 'Types',
          description: '',
          types: [],
        };
      }
    );

    expect(stringFilter).toEqual([
      {
        columnId: 'type',
        value: 'Value 1',
        valueType: 'string',
        valueName: null,
      },
    ]);

    const entityFilter = await createFiltersFromGraphQLString(
      `{typeIds_contains_nocase: ["type-id"], entityOf_: {attribute: "type", entityValue: "id 1"}}`,
      async () => {
        return {
          id: 'id 1',
          triples: [MockNetworkData.makeStubTriple('Types')],
          name: 'Entity Name',
          description: '',
          types: [],
        };
      }
    );

    expect(entityFilter).toEqual([{ columnId: 'type', valueName: 'Entity Name', value: 'id 1', valueType: 'entity' }]);

    const nameFilter = await createFiltersFromGraphQLString(
      `{typeIds_contains_nocase: ["type-id"], name_starts_with_nocase: "id 1"}`,
      async () => {
        return {
          id: 'type',
          triples: [MockNetworkData.makeStubTriple('Name')],
          name: 'Name',
          description: '',
          types: [],
        };
      }
    );

    expect(nameFilter).toEqual([
      {
        columnId: SYSTEM_IDS.NAME,
        value: 'id 1',
        valueType: 'string',
        valueName: null,
      },
    ]);

    const andFilter = await createFiltersFromGraphQLString(
      `{and: [{typeIds_contains_nocase: ["type-id"]}, {entityOf_: {attribute: "type", stringValue_starts_with_nocase: "Value 1"}}, {entityOf_: {attribute: "type", entityValue: "id 1"}}, {name_starts_with_nocase: "id 1"}]}`,
      async () => {
        return {
          id: 'id 1',
          triples: [MockNetworkData.makeStubTriple('Types')],
          name: 'Entity Name',
          description: '',
          types: [],
        };
      }
    );

    expect(andFilter).toEqual([
      {
        columnId: SYSTEM_IDS.NAME,
        value: 'id 1',
        valueType: 'string',
        valueName: null,
      },
      {
        columnId: 'type',
        value: 'id 1',
        valueType: 'entity',
        valueName: 'Entity Name',
      },
      {
        columnId: 'type',
        value: 'Value 1',
        valueType: 'string',
        valueName: null,
      },
    ]);

    const spaceFilter = await createFiltersFromGraphQLString(
      `{typeIds_contains_nocase: ["type-id"], entityOf_: {space: "0x0000000000000000000000000000000000000000"}}`,
      async () => {
        return {
          id: 'id 1',
          triples: [MockNetworkData.makeStubTriple('Types')],
          name: 'Entity Name',
          description: '',
          types: [],
        };
      }
    );

    expect(spaceFilter).toEqual([
      {
        columnId: SYSTEM_IDS.SPACE,
        value: '0x0000000000000000000000000000000000000000',
        valueType: 'string',
        valueName: null,
      },
    ]);
  });

  it('Builds a graphql query from table block filters for the postgraphile-based substreams API', () => {
    const stringFilter = createGraphQLStringFromFiltersV2(
      [
        {
          columnId: 'type',
          value: 'Value 1',
          valueType: 'TEXT',
        },
      ],
      'type-id'
    );

    expect(stringFilter).toMatchSnapshot();

    const entityFilter = createGraphQLStringFromFiltersV2(
      [
        {
          columnId: 'type',
          value: 'id 1',
          valueType: 'ENTITY',
        },
      ],
      'type-id'
    );

    expect(entityFilter).toMatchSnapshot();

    const nameFilter = createGraphQLStringFromFiltersV2(
      [
        {
          columnId: SYSTEM_IDS.NAME,
          value: 'id 1',
          valueType: 'TEXT',
        },
      ],
      'type-id'
    );

    expect(nameFilter).toMatchSnapshot();

    const andFilter = createGraphQLStringFromFiltersV2(
      [
        {
          columnId: 'type',
          value: 'Value 1',
          valueType: 'TEXT',
        },
        {
          columnId: 'type',
          value: 'id 1',
          valueType: 'ENTITY',
        },
        {
          columnId: SYSTEM_IDS.NAME,
          value: 'id 1',
          valueType: 'TEXT',
        },
      ],
      'type-id'
    );

    expect(andFilter).toMatchSnapshot();

    const spaceFilter = createGraphQLStringFromFiltersV2(
      [
        {
          columnId: SYSTEM_IDS.SPACE,
          valueType: 'TEXT',
          value: '0x0000000000000000000000000000000000000000',
        },
      ],
      'type-id'
    );

    expect(spaceFilter).toMatchSnapshot();

    const nullTypeIdFilter = createGraphQLStringFromFiltersV2([], null);

    expect(nullTypeIdFilter).toEqual('');
  });
});
