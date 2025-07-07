import {
  DataTypes,
  EntityFilter,
  EntityToManyRelationFilter,
  EntityToManyValueFilter,
  PropertyFilter,
  RelationFilter,
  StringFilter,
  UuidFilter,
  UuidListFilter,
  ValueFilter,
} from '~/core/gql/graphql';
import {
  // BooleanCondition,
  NumberCondition,
  RelationCondition,
  StringCondition,
  ValueCondition,
  WhereCondition,
} from '~/core/sync/experimental_query-layer';

/**
 * Converts a StringCondition to a StringFilter for GraphQL
 */
function convertStringConditionToStringFilter(condition: StringCondition | undefined): StringFilter | undefined {
  if (!condition) return undefined;

  const filter: StringFilter = {};

  // Handle string literal (shorthand for equals)
  if (typeof condition === 'string') {
    filter.is = condition;
    return filter;
  }

  // Map StringCondition operators to StringFilter operators
  if (condition.equals !== undefined) {
    // Note: The comment in the code mentions using startsWith for equals
    // to match previous filter behavior
    filter.startsWith = condition.equals;
  }

  if (condition.fuzzy !== undefined || condition.contains !== undefined) {
    filter.includes = condition.fuzzy || condition.contains;
  }

  if (condition.startsWith !== undefined) {
    filter.startsWith = condition.startsWith;
  }

  if (condition.endsWith !== undefined) {
    filter.endsWith = condition.endsWith;
  }

  if (condition.in !== undefined) {
    filter.in = condition.in;
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

/**
 * Converts a StringCondition to a UuidFilter for GraphQL
 */
function convertStringConditionToUuidFilter(condition: StringCondition | undefined): UuidFilter | undefined {
  if (!condition) return undefined;

  const filter: UuidFilter = {};

  // Handle string literal (shorthand for equals)
  if (typeof condition === 'string') {
    filter.is = condition as any; // UUID type
    return filter;
  }

  // For UUID fields, we primarily use equals and in operators
  if (condition.equals !== undefined) {
    filter.is = condition.equals as any;
  }

  if (condition.in !== undefined) {
    filter.in = condition.in as any[];
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

/**
 * Converts a ValueCondition to a ValueFilter for GraphQL
 */
function convertValueConditionToValueFilter(condition: ValueCondition): ValueFilter {
  const filter: ValueFilter = {};

  if (condition.propertyId) {
    filter.propertyId = convertStringConditionToUuidFilter(condition.propertyId);
  }

  if (condition.propertyName) {
    filter.property = {
      name: convertStringConditionToStringFilter(condition.propertyName),
    } as PropertyFilter;
  }

  if (condition.space) {
    filter.spaceId = convertStringConditionToUuidFilter(condition.space);
  }

  if (condition.dataType) {
    filter.property = {
      ...filter.property,
      dataType: { is: condition.dataType as DataTypes },
    } as PropertyFilter;
  }

  // Handle value based on type
  if (condition.value) {
    if (
      typeof condition.value === 'object' &&
      'equals' in condition.value &&
      typeof condition.value.equals === 'boolean'
    ) {
      // Boolean condition - convert to string filter
      filter.value = { is: String(condition.value.equals) };
    } else if (
      typeof condition.value === 'object' &&
      ('gt' in condition.value ||
        'gte' in condition.value ||
        'lt' in condition.value ||
        'lte' in condition.value ||
        'between' in condition.value)
    ) {
      // Number condition - convert to string filter (GraphQL treats as string)
      const numCondition = condition.value as NumberCondition;
      if (numCondition.equals !== undefined) {
        filter.value = { is: String(numCondition.equals) };
      }
      // Note: GraphQL StringFilter doesn't support numeric comparisons directly
      // You may need to handle this differently based on your GraphQL schema
    } else {
      // String condition
      filter.value = convertStringConditionToStringFilter(condition.value as StringCondition);
    }
  }

  return filter;
}

/**
 * Converts a RelationCondition to a RelationFilter for GraphQL
 */
function convertRelationConditionToRelationFilter(condition: RelationCondition): RelationFilter {
  const filter: RelationFilter = {};

  if (condition.typeOf?.id) {
    filter.typeId = convertStringConditionToUuidFilter(condition.typeOf.id);
  }

  if (condition.typeOf?.name) {
    filter.type = {
      name: convertStringConditionToStringFilter(condition.typeOf.name),
    } as PropertyFilter;
  }

  if (condition.toEntity?.id) {
    filter.toEntityId = convertStringConditionToUuidFilter(condition.toEntity.id);
  }

  if (condition.toEntity?.name) {
    filter.toEntity = {
      name: convertStringConditionToStringFilter(condition.toEntity.name),
    } as EntityFilter;
  }

  if (condition.space) {
    filter.spaceId = convertStringConditionToUuidFilter(condition.space);
  }

  return filter;
}

/**
 * Main function to convert WhereCondition to EntityFilter
 */
export function convertWhereConditionToEntityFilter(where: WhereCondition): EntityFilter {
  const filter: EntityFilter = {};

  // Handle logical operators
  if (where.OR && where.OR.length > 0) {
    filter.or = where.OR.map(cond => convertWhereConditionToEntityFilter(cond));
  }

  if (where.AND && where.AND.length > 0) {
    filter.and = where.AND.map(cond => convertWhereConditionToEntityFilter(cond));
  }

  if (where.NOT) {
    filter.not = convertWhereConditionToEntityFilter(where.NOT);
  }

  // Handle simple fields
  if (where.id) {
    filter.id = convertStringConditionToUuidFilter(where.id);
  }

  if (where.name) {
    filter.name = convertStringConditionToStringFilter(where.name);
  }

  if (where.description) {
    filter.description = convertStringConditionToStringFilter(where.description);
  }

  // Handle types - convert to typeIds
  if (where.types && where.types.length > 0) {
    const typeIds: string[] = [];
    where.types.forEach(typeCondition => {
      if (typeCondition.id?.equals) {
        typeIds.push(typeCondition.id.equals);
      }
    });
    if (typeIds.length > 0) {
      filter.typeIds = { anyEqualTo: typeIds[0] } as UuidListFilter;
      // For multiple types, you might want to use a different operator
      // or handle this case differently based on your needs
    }
  }

  // @TODO restore once space ids are updated in filters
  // Handle spaces - convert to spaceIds
  // if (where.spaces && where.spaces.length > 0) {
  //   const spaceIds: string[] = [];
  //   where.spaces.forEach(spaceCondition => {
  //     if (spaceCondition.equals) {
  //       spaceIds.push(spaceCondition.equals);
  //     }
  //   });
  //   if (spaceIds.length > 0) {
  //     filter.spaceIds = { in: spaceIds } as UuidListFilter;
  //   }
  // }

  // @TODO restore once space ids are updated in filters
  // Handle space (single)
  // if (where.space?.id) {
  //   const spaceId = where.space.id.equals;
  //   if (spaceId) {
  //     filter.spaceIds = { anyEqualTo: spaceId } as UuidListFilter;
  //   }
  // }

  // Handle values - multiple values should be ANDed together
  if (where.values && where.values.length > 0) {
    const valueFilters = where.values.map(v => convertValueConditionToValueFilter(v));

    if (valueFilters.length === 1) {
      filter.values = {
        some: valueFilters[0],
      } as EntityToManyValueFilter;
    } else {
      // Multiple value conditions should be ANDed together
      // Each condition needs to be satisfied by at least one value
      filter.and = filter.and || [];
      valueFilters.forEach(vf => {
        filter.and!.push({
          values: { some: vf },
        } as EntityFilter);
      });
    }
  }

  // Handle relations - multiple relations should be ANDed together
  if (where.relations && where.relations.length > 0) {
    const relationFilters = where.relations.map(r => convertRelationConditionToRelationFilter(r));

    if (relationFilters.length === 1) {
      filter.relations = {
        some: relationFilters[0],
      } as EntityToManyRelationFilter;
    } else {
      // Multiple relation conditions should be ANDed together
      // Each condition needs to be satisfied by at least one relation
      filter.and = filter.and || [];
      relationFilters.forEach(rf => {
        filter.and!.push({
          relations: { some: rf },
        } as EntityFilter);
      });
    }
  }

  return filter;
}
