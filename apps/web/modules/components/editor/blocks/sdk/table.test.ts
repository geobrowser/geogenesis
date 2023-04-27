import { describe, expect, it } from 'vitest';
import { createFiltersFromGraphQLString, createGraphQLStringFromFilters } from './table';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { MockNetworkData } from '~/modules/io';

describe('TableBlock SDK', () => {
  it('Builds a graphql query from table block filters', () => {
    /**
     * There are several combinations of filters that can be applied to a table block.
     * 1. String field with a string value
     * 2. Entity field with an entity ID as the value
     * 3. String field targeting the Name column
     * 4. A null type id
     *
     * These four combinations can also be used together with an "and" filter
     */
    const stringFilter = createGraphQLStringFromFilters(
      [
        {
          columnId: 'type',
          columnName: 'Types',
          value: 'Value 1',
          valueType: 'string',
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
          columnName: 'Types',
          value: 'id 1',
          valueType: 'entity',
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
          columnName: 'Name',
          value: 'id 1',
          valueType: 'string',
        },
      ],
      'type-id'
    );

    expect(nameFilter).toEqual(`{typeIds_contains_nocase: ["type-id"], name_starts_with_nocase: "id 1"}`);

    const andFilter = createGraphQLStringFromFilters(
      [
        {
          columnId: 'type',
          columnName: 'Types',
          value: 'Value 1',
          valueType: 'string',
        },
        {
          columnId: 'type',
          columnName: 'Types',
          value: 'id 1',
          valueType: 'entity',
        },
        {
          columnId: SYSTEM_IDS.NAME,
          columnName: 'Name',
          value: 'id 1',
          valueType: 'string',
        },
      ],
      'type-id'
    );

    expect(andFilter).toEqual(
      `{and: [{typeIds_contains_nocase: ["type-id"]}, {entityOf_: {attribute: "type", stringValue_starts_with_nocase: "Value 1"}}, {entityOf_: {attribute: "type", entityValue: "id 1"}}, {name_starts_with_nocase: "id 1"}]}`
    );

    const nullTypeIdFilter = createGraphQLStringFromFilters([], null);

    expect(nullTypeIdFilter).toEqual('');
  });

  it('Builds the TableBlockStore filters data structure from a graphql string', () => {
    /**
     * There are several combinations of filters that can be applied to a table block.
     * 1. String field with a string value
     * 2. Entity field with an entity ID as the value
     * 3. String field targeting the Name column
     * 4. A null type id
     *
     * These four combinations can also be used together with an "and" filter
     */
    const stringFilter = createFiltersFromGraphQLString(
      `{typeIds_contains_nocase: ["type-id"], entityOf_: {attribute: "type", stringValue_starts_with_nocase: "Value 1"}}`,
      [
        {
          id: 'type',
          triples: [MockNetworkData.makeStubTriple('Types')],
        },
      ]
    );

    expect(stringFilter).toEqual([
      {
        columnId: 'type',
        columnName: 'Types',
        value: 'Value 1',
        valueType: 'string',
      },
    ]);

    const entityFilter = createFiltersFromGraphQLString(
      `{typeIds_contains_nocase: ["type-id"], entityOf_: {attribute: "type", entityValue: "id 1"}}`,
      [
        {
          id: 'type',
          triples: [MockNetworkData.makeStubTriple('Types')],
        },
      ]
    );

    expect(entityFilter).toEqual([{ columnId: 'type', columnName: 'Types', value: 'id 1', valueType: 'entity' }]);

    const nameFilter = createFiltersFromGraphQLString(
      `{typeIds_contains_nocase: ["type-id"], name_starts_with_nocase: "id 1"}`,
      [
        {
          id: SYSTEM_IDS.NAME,
          triples: [MockNetworkData.makeStubTriple('Name')],
        },
      ]
    );

    expect(nameFilter).toEqual([
      {
        columnId: SYSTEM_IDS.NAME,
        columnName: 'Name',
        value: 'id 1',
        valueType: 'string',
      },
    ]);

    const andFilter = createFiltersFromGraphQLString(
      `{and: [{typeIds_contains_nocase: ["type-id"]}, {entityOf_: {attribute: "type", stringValue_starts_with_nocase: "Value 1"}}, {entityOf_: {attribute: "type", entityValue: "id 1"}}, {name_starts_with_nocase: "id 1"}]}`,
      [
        {
          id: 'type',
          triples: [MockNetworkData.makeStubTriple('Types')],
        },
        {
          id: SYSTEM_IDS.NAME,
          triples: [MockNetworkData.makeStubTriple('Name')],
        },
      ]
    );

    expect(andFilter).toEqual([
      {
        columnId: SYSTEM_IDS.NAME,
        columnName: 'Name',
        value: 'id 1',
        valueType: 'string',
      },
      {
        columnId: 'type',
        columnName: 'Types',
        value: 'id 1',
        valueType: 'entity',
      },
      {
        columnId: 'type',
        columnName: 'Types',
        value: 'Value 1',
        valueType: 'string',
      },
    ]);
  });
});
