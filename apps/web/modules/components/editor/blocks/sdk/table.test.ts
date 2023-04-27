import { describe, expect, it } from 'vitest';
import { createGraphQLStringFromFilters } from './table';
import { SYSTEM_IDS } from '@geogenesis/ids';

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
      `{typeIds_contains_nocase: ["type-id"], entityOf_: {attribute: "type", stringValue_starts_with_no_case: "Value 1"}}`
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
      `{and: [{typeIds_contains_nocase: ["type-id"]}, {entityOf_: {attribute: "type", stringValue_starts_with_no_case: "Value 1"}}, {entityOf_: {attribute: "type", entityValue: "id 1"}}, {name_starts_with_nocase: "id 1"}]}`
    );

    const nullTypeIdFilter = createGraphQLStringFromFilters([], null);

    expect(nullTypeIdFilter).toEqual('');
  });
});
