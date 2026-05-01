import {
  BigFloatFilter,
  BigIntFilter,
  BooleanFilter,
  EntityFilter,
  EntityToManyRelationFilter,
  EntityToManyValueFilter,
  FloatFilter,
  RelationFilter,
  StringFilter,
  UuidFilter,
  UuidListFilter,
  ValueFilter,
} from '~/core/gql/graphql';
import {
  BacklinkCondition,
  BooleanCondition,
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

  // Map StringCondition operators to StringFilter operators (case-insensitive)
  if (condition.equals !== undefined) {
    // Note: The comment in the code mentions using startsWith for equals
    // to match previous filter behavior
    // Use case-insensitive variant for better UX
    filter.startsWithInsensitive = condition.equals;
  }

  if (condition.fuzzy !== undefined || condition.contains !== undefined) {
    // Use case-insensitive variant for partial text matching
    filter.includesInsensitive = condition.fuzzy || condition.contains;
  }

  if (condition.startsWith !== undefined) {
    // Use case-insensitive variant
    filter.startsWithInsensitive = condition.startsWith;
  }

  if (condition.endsWith !== undefined) {
    // Use case-insensitive variant
    filter.endsWithInsensitive = condition.endsWith;
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
 * Maps a StringCondition (text values) to a case-insensitive StringFilter
 * suitable for the `text` / `date` / `datetime` / `time` fields on
 * ValueFilter. Differs from `convertStringConditionToStringFilter` in two
 * ways: it prefers `inInsensitive` for arrays so multi-value text filters
 * collapse into one clause, and it routes equality through `isInsensitive`
 * rather than `startsWithInsensitive`.
 */
function convertStringConditionToInsensitiveStringFilter(
  condition: StringCondition | undefined
): StringFilter | undefined {
  if (!condition) return undefined;

  if (typeof condition === 'string') {
    return { isInsensitive: condition };
  }

  const filter: StringFilter = {};

  if (condition.equals !== undefined) {
    filter.isInsensitive = condition.equals;
  }
  if (condition.fuzzy !== undefined || condition.contains !== undefined) {
    filter.includesInsensitive = condition.fuzzy ?? condition.contains;
  }
  if (condition.startsWith !== undefined) {
    filter.startsWithInsensitive = condition.startsWith;
  }
  if (condition.endsWith !== undefined) {
    filter.endsWithInsensitive = condition.endsWith;
  }
  if (condition.in !== undefined && condition.in.length > 0) {
    filter.inInsensitive = condition.in;
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

function buildBigIntFilter(condition: NumberCondition): BigIntFilter | undefined {
  const filter: BigIntFilter = {};
  if (condition.equals !== undefined) filter.is = String(condition.equals);
  if (condition.gt !== undefined) filter.greaterThan = String(condition.gt);
  if (condition.gte !== undefined) filter.greaterThanOrEqualTo = String(condition.gte);
  if (condition.lt !== undefined) filter.lessThan = String(condition.lt);
  if (condition.lte !== undefined) filter.lessThanOrEqualTo = String(condition.lte);
  if (condition.in !== undefined && condition.in.length > 0) filter.in = condition.in.map(String);
  return Object.keys(filter).length > 0 ? filter : undefined;
}

function buildFloatFilter(condition: NumberCondition): FloatFilter | undefined {
  const filter: FloatFilter = {};
  if (condition.equals !== undefined) filter.is = condition.equals;
  if (condition.gt !== undefined) filter.greaterThan = condition.gt;
  if (condition.gte !== undefined) filter.greaterThanOrEqualTo = condition.gte;
  if (condition.lt !== undefined) filter.lessThan = condition.lt;
  if (condition.lte !== undefined) filter.lessThanOrEqualTo = condition.lte;
  if (condition.in !== undefined && condition.in.length > 0) filter.in = condition.in;
  return Object.keys(filter).length > 0 ? filter : undefined;
}

function buildBigFloatFilter(condition: NumberCondition): BigFloatFilter | undefined {
  const filter: BigFloatFilter = {};
  if (condition.equals !== undefined) filter.is = String(condition.equals);
  if (condition.gt !== undefined) filter.greaterThan = String(condition.gt);
  if (condition.gte !== undefined) filter.greaterThanOrEqualTo = String(condition.gte);
  if (condition.lt !== undefined) filter.lessThan = String(condition.lt);
  if (condition.lte !== undefined) filter.lessThanOrEqualTo = String(condition.lte);
  if (condition.in !== undefined && condition.in.length > 0) filter.in = condition.in.map(String);
  return Object.keys(filter).length > 0 ? filter : undefined;
}

function buildBooleanFilter(condition: BooleanCondition): BooleanFilter {
  return { is: condition.equals };
}

/**
 * Converts a ValueCondition to a ValueFilter for GraphQL.
 *
 * Routes the value to the matching scalar field on `ValueFilter` (`text`,
 * `integer`, `float`, `decimal`, `datetime`, `date`, `time`, `boolean`)
 * based on `condition.dataType`. Without a `dataType` hint we fall back
 * to populating `text`, which is the legacy behavior — fine for old
 * persisted filters but every new filter the data block UI builds carries
 * the correct dataType so multi-value selections end up in `text.inInsensitive`,
 * `integer.in`, etc., as a single clause instead of a nested OR fan-out.
 */
function convertValueConditionToValueFilter(condition: ValueCondition): ValueFilter {
  const filter: ValueFilter = {};

  if (condition.propertyId) {
    filter.propertyId = convertStringConditionToUuidFilter(condition.propertyId);
  }

  if (condition.space) {
    filter.spaceId = convertStringConditionToUuidFilter(condition.space);
  }

  if (!condition.value) {
    return filter;
  }

  // Boolean values are scalar; arrays are meaningless (only two possible values).
  if (typeof condition.value === 'object' && 'equals' in condition.value && typeof condition.value.equals === 'boolean') {
    filter.boolean = buildBooleanFilter(condition.value as BooleanCondition);
    return filter;
  }

  // Numeric values: route by dataType. We can't tell INTEGER vs FLOAT vs DECIMAL
  // from the JS value alone (5 could be any of the three), so the data block
  // layer must supply `dataType` whenever it builds a numeric filter.
  const isNumberCondition =
    typeof condition.value === 'object' &&
    ('gt' in condition.value ||
      'gte' in condition.value ||
      'lt' in condition.value ||
      'lte' in condition.value ||
      'between' in condition.value ||
      ('in' in condition.value && Array.isArray(condition.value.in) && typeof condition.value.in[0] === 'number') ||
      (typeof condition.value === 'object' &&
        'equals' in condition.value &&
        typeof condition.value.equals === 'number'));

  if (isNumberCondition) {
    const numCondition = condition.value as NumberCondition;
    switch (condition.dataType) {
      case 'INTEGER': {
        const built = buildBigIntFilter(numCondition);
        if (built) filter.integer = built;
        return filter;
      }
      case 'FLOAT': {
        const built = buildFloatFilter(numCondition);
        if (built) filter.float = built;
        return filter;
      }
      case 'DECIMAL': {
        const built = buildBigFloatFilter(numCondition);
        if (built) filter.decimal = built;
        return filter;
      }
      default: {
        // No dataType hint — preserve legacy behavior of stringifying into `text`.
        if (numCondition.equals !== undefined) {
          filter.text = { is: String(numCondition.equals) };
        }
        return filter;
      }
    }
  }

  // String/string-like values. ValueFilter exposes `text`, `date`, `datetime`,
  // `time`, `point` as StringFilters; pick by dataType (default to `text`).
  const stringCondition = condition.value as StringCondition;
  const stringFilter = convertStringConditionToInsensitiveStringFilter(stringCondition);
  if (!stringFilter) return filter;

  switch (condition.dataType) {
    case 'DATETIME':
      filter.datetime = stringFilter;
      break;
    case 'DATE':
      filter.date = stringFilter;
      break;
    case 'TIME':
      filter.time = stringFilter;
      break;
    case 'TEXT':
    default:
      filter.text = stringFilter;
      break;
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
    filter.typeEntity = {
      name: convertStringConditionToStringFilter(condition.typeOf.name),
    } as EntityFilter;
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
 * Convert backlink conditions to relation filter format
 */
function convertBacklinkConditionToRelationFilter(condition: BacklinkCondition): RelationFilter {
  const filter: RelationFilter = {};

  if (condition.fromEntity?.id) {
    filter.fromEntityId = convertStringConditionToUuidFilter(condition.fromEntity.id);
  }

  if (condition.fromEntity?.name) {
    filter.fromEntity = {
      name: convertStringConditionToStringFilter(condition.fromEntity.name),
    } as EntityFilter;
  }

  if (condition.typeOf?.id) {
    filter.typeId = convertStringConditionToUuidFilter(condition.typeOf.id);
  }

  if (condition.typeOf?.name) {
    filter.typeEntity = {
      name: convertStringConditionToStringFilter(condition.typeOf.name),
    } as EntityFilter;
  }

  if (condition.space) {
    filter.spaceId = convertStringConditionToUuidFilter(condition.space);
  }

  return filter;
}

export type ConvertWhereOptions = {
  /**
   * When false (default), the produced filter is AND-combined with
   * `name: { isNull: false, isNot: "" }` so entities with null/empty names
   * are excluded. Pass `true` to receive the raw filter without that clause
   * (e.g., dev tooling that needs to see every entity).
   */
  includeEmptyNames?: boolean;
};

/**
 * Convert WhereCondition to EntityFilter and inject the default empty-name
 * exclusion at the top level (unless opted out). Recursive subtree conversion
 * goes through `convertWhereConditionToEntityFilterInner` directly so the
 * empty-name clause is added exactly once.
 */
export function convertWhereConditionToEntityFilter(
  where: WhereCondition,
  options?: ConvertWhereOptions
): EntityFilter {
  const filter = convertWhereConditionToEntityFilterInner(where);

  if (options?.includeEmptyNames) {
    return filter;
  }

  const emptyNameExclusion: EntityFilter = { name: { isNull: false, isNot: '' } };

  if (Object.keys(filter).length === 0) {
    return emptyNameExclusion;
  }

  return { and: [filter, emptyNameExclusion] };
}

function convertWhereConditionToEntityFilterInner(where: WhereCondition): EntityFilter {
  const filter: EntityFilter = {};

  // Handle logical operators
  if (where.OR && where.OR.length > 0) {
    filter.or = where.OR.map(cond => convertWhereConditionToEntityFilterInner(cond));
  }

  if (where.AND && where.AND.length > 0) {
    filter.and = where.AND.map(cond => convertWhereConditionToEntityFilterInner(cond));
  }

  if (where.NOT) {
    filter.not = convertWhereConditionToEntityFilterInner(where.NOT);
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

  // Handle types - convert to typeIds filter field.
  // When types are at the top level of the where condition, extractTypeIdsFromWhere()
  // also extracts them for the top-level query parameter (and removeTypeIdsFromFilter
  // strips the duplicate from the filter). When types appear inside AND/OR branches,
  // extractTypeIdsFromWhere() won't find them, so this filter conversion is the only path.
  if (where.types && where.types.length > 0) {
    const typeIdValues: string[] = [];
    where.types.forEach(typeCondition => {
      if (typeCondition.id?.equals) {
        typeIdValues.push(typeCondition.id.equals);
      }
    });

    if (typeIdValues.length === 1) {
      filter.typeIds = { anyEqualTo: typeIdValues[0] } as UuidListFilter;
    } else if (typeIdValues.length > 1) {
      // Multiple types in one array = match any (OR semantics within the array)
      filter.or = filter.or || [];
      typeIdValues.forEach(id => {
        filter.or!.push({ typeIds: { anyEqualTo: id } as UuidListFilter });
      });
    }
  }

  // @TODO restore once space ids are updated in filters
  // Handle spaces - convert to spaceIds
  if (where.spaces && where.spaces.length > 0) {
    const spaceIds: string[] = [];
    where.spaces.forEach(spaceCondition => {
      if (spaceCondition.equals) {
        spaceIds.push(spaceCondition.equals);
      }
    });
    if (spaceIds.length > 0) {
      filter.spaceIds = { in: spaceIds } as UuidListFilter;
    }
  }

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

  // Handle backlinks
  if (where.backlinks && where.backlinks.length > 0) {
    const backlinkFilters = where.backlinks.map(b => convertBacklinkConditionToRelationFilter(b));

    if (backlinkFilters.length === 1) {
      filter.backlinks = {
        some: backlinkFilters[0],
      } as EntityToManyRelationFilter;
    } else {
      // Multiple backlink conditions should be ANDed together
      filter.and = filter.and || [];
      backlinkFilters.forEach(bf => {
        filter.and!.push({
          backlinks: { some: bf },
        } as EntityFilter);
      });
    }
  }

  return filter;
}

/**
 * Extracts typeIds from a WhereCondition for use as a top-level query parameter.
 * This is more efficient than using filter.typeIds.
 */
export function extractTypeIdsFromWhere(where: WhereCondition): UuidFilter | undefined {
  if (!where.types || where.types.length === 0) {
    return undefined;
  }

  const typeIds: string[] = [];
  where.types.forEach(typeCondition => {
    if (typeCondition.id?.equals) {
      typeIds.push(typeCondition.id.equals);
    }
  });

  if (typeIds.length === 0) {
    return undefined;
  }

  if (typeIds.length === 1) {
    return { is: typeIds[0] } as UuidFilter;
  }

  return { in: typeIds } as UuidFilter;
}
