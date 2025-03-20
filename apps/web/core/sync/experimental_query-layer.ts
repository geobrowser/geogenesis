import { Entity } from '~/core/io/dto/entities';
import { GeoStore } from '~/core/sync/store';
import { Relation, Triple } from '~/core/types';

import { EntityId } from '../../../core/io/schema';

const compareOperators = {
  string: {
    equals: (a: string, b: string) => a === b,
    contains: (a: string, b: string) => a.toLowerCase().includes(b.toLowerCase()),
    startsWith: (a: string, b: string) => a.toLowerCase().startsWith(b.toLowerCase()),
    endsWith: (a: string, b: string) => a.toLowerCase().endsWith(b.toLowerCase()),
  },
  number: {
    equals: (a: number, b: number) => a === b,
    gt: (a: number, b: number) => a > b,
    gte: (a: number, b: number) => a >= b,
    lt: (a: number, b: number) => a < b,
    lte: (a: number, b: number) => a <= b,
    between: (a: number, [min, max]: [number, number]) => a >= min && a <= max,
  },
  boolean: {
    equals: (a: boolean, b: boolean) => a === b,
  },
};

/**
 * Types for query conditions
 */
type StringCondition = { equals?: string; contains?: string; startsWith?: string; endsWith?: string; in?: string[] };

type NumberCondition =
  | number
  | { equals?: number; gt?: number; gte?: number; lt?: number; lte?: number; between?: [number, number] };

type BooleanCondition = boolean | { equals: boolean };

type TripleCondition = {
  attributeName?: StringCondition;
  attributeId?: StringCondition;
  value?: StringCondition | NumberCondition | BooleanCondition;
  valueType?: 'TEXT' | 'URL' | 'TIME' | 'CHECKBOX' | 'NUMBER';
  space?: StringCondition;
};

type RelationCondition = {
  typeOf?: { id?: StringCondition; name?: StringCondition };
  toEntity?: { id?: StringCondition; name?: StringCondition };
  space?: StringCondition;
};

export type WhereCondition = {
  id?: StringCondition;
  name?: StringCondition;
  description?: StringCondition;
  types?: { id?: StringCondition; name?: StringCondition }[];
  spaces?: StringCondition[];
  triples?: TripleCondition | TripleCondition[];
  relations?: RelationCondition | RelationCondition[];
  OR?: WhereCondition[];
  AND?: WhereCondition[];
  NOT?: WhereCondition;
};

// Sorting options
type SortDirection = 'asc' | 'desc';
type SortByField = 'id' | 'name' | 'description' | 'createdAt' | 'updatedAt';
type SortBy = SortByField | { field: SortByField; direction: SortDirection };

/**
 * EntityQuery class for building and executing entity queries
 */
export class EntityQuery {
  private store: GeoStore;
  private whereConditions: WhereCondition[] = [];
  private limitVal: number | undefined;
  private offsetVal: number = 0;
  private sortByVal: SortBy[] = [];
  private includeDeletedVal: boolean = false;
  private selectFields: string[] = [];

  constructor(store: GeoStore) {
    this.store = store;
  }

  /**
   * Add a where condition to the query
   */
  where(condition: WhereCondition): EntityQuery {
    this.whereConditions.push(condition);
    return this;
  }

  /**
   * Add an OR condition to the query
   */
  orWhere(conditions: WhereCondition[]): EntityQuery {
    this.whereConditions.push({ OR: conditions });
    return this;
  }

  /**
   * Add an AND condition to the query
   */
  andWhere(conditions: WhereCondition[]): EntityQuery {
    this.whereConditions.push({ AND: conditions });
    return this;
  }

  /**
   * Add a NOT condition to the query
   */
  not(condition: WhereCondition): EntityQuery {
    this.whereConditions.push({ NOT: condition });
    return this;
  }

  /**
   * Filter by ID
   */
  whereId(condition: StringCondition): EntityQuery {
    return this.where({ id: condition });
  }

  /**
   * Filter by name
   */
  whereName(condition: StringCondition): EntityQuery {
    return this.where({ name: condition });
  }

  /**
   * Filter by description
   */
  whereDescription(condition: StringCondition): EntityQuery {
    return this.where({ description: condition });
  }

  /**
   * Filter by types
   */
  whereType(condition: { id?: StringCondition; name?: StringCondition }): EntityQuery {
    return this.where({ types: [condition] });
  }

  /**
   * Filter by triple (property)
   */
  whereTriple(condition: TripleCondition): EntityQuery {
    return this.where({ triples: condition });
  }

  /**
   * Filter by relation
   */
  whereRelation(condition: RelationCondition): EntityQuery {
    return this.where({ relations: condition });
  }

  /**
   * Include deleted entities in the results
   */
  includeDeleted(include: boolean = true): EntityQuery {
    this.includeDeletedVal = include;
    return this;
  }

  /**
   * Limit the number of results
   */
  limit(n: number): EntityQuery {
    this.limitVal = n;
    return this;
  }

  /**
   * Skip a number of results
   */
  offset(n: number): EntityQuery {
    this.offsetVal = n;
    return this;
  }

  /**
   * Set sorting options
   */
  sortBy(...fields: SortBy[]): EntityQuery {
    this.sortByVal = fields;
    return this;
  }

  /**
   * Select specific fields to include in the results
   */
  select(...fields: string[]): EntityQuery {
    this.selectFields = fields;
    return this;
  }

  /**
   * Execute the query and return the results
   */
  execute(): Entity[] {
    // Get all entities from the store
    const allEntities = this.store.getEntities();

    // Apply where conditions
    let filteredEntities = this.applyWhereConditions(allEntities);

    // Apply sorting
    if (this.sortByVal.length > 0) {
      filteredEntities = this.applySorting(filteredEntities);
    }

    // Apply pagination
    if (this.offsetVal > 0 || this.limitVal !== undefined) {
      filteredEntities = this.applyPagination(filteredEntities);
    }

    // Select fields if specified
    if (this.selectFields.length > 0) {
      filteredEntities = this.applyFieldSelection(filteredEntities);
    }

    return filteredEntities;
  }

  /**
   * Execute the query and return the first result or null
   */
  async findFirst(): Promise<Entity | null> {
    const results = await this.limit(1).execute();
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Execute the query and return a single result or throw an error if not found
   */
  async findOne(): Promise<Entity> {
    const entity = await this.findFirst();
    if (!entity) {
      throw new Error('Entity not found');
    }
    return entity;
  }

  /**
   * Count the number of entities that match the query
   */
  async count(): Promise<number> {
    const results = await this.execute();
    return results.length;
  }

  /**
   * Get an entity by ID
   */
  async findById(id: EntityId): Promise<Entity | null> {
    return this.whereId({
      equals: id,
    }).findFirst();
  }

  /**
   * Check if any entities match the query
   */
  async exists(): Promise<boolean> {
    const count = await this.count();
    return count > 0;
  }

  /**
   * Apply where conditions to the entity list
   */
  private applyWhereConditions(entities: Entity[]): Entity[] {
    if (this.whereConditions.length === 0) {
      return entities;
    }

    return entities.filter(entity => {
      // Only include non-deleted entities unless includeDeleted is true
      if (!this.includeDeletedVal && this.store.isEntityDeleted(entity.id)) {
        return false;
      }

      // Check all conditions (implicit AND between multiple where calls)
      return this.whereConditions.every(condition => this.matchesCondition(entity, condition));
    });
  }

  /**
   * Check if an entity matches a condition
   */
  private matchesCondition(entity: Entity, condition: WhereCondition): boolean {
    // Handle OR conditions
    if (condition.OR) {
      return condition.OR.some(subCondition => this.matchesCondition(entity, subCondition));
    }

    // Handle AND conditions
    if (condition.AND) {
      return condition.AND.every(subCondition => this.matchesCondition(entity, subCondition));
    }

    // Handle NOT condition
    if (condition.NOT) {
      return !this.matchesCondition(entity, condition.NOT);
    }

    // Check individual field conditions
    for (const [field, value] of Object.entries(condition)) {
      if (field === 'OR' || field === 'AND' || field === 'NOT') {
        continue; // Already handled above
      }

      if (!this.matchesField(entity, field, value)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if an entity field matches a condition
   */
  private matchesField(entity: Entity, field: string, condition: any): boolean {
    switch (field) {
      case 'id':
        return this.matchesStringCondition(entity.id as string, condition);

      case 'name':
        return this.matchesStringCondition(entity.name || '', condition);

      case 'description':
        return this.matchesStringCondition(entity.description || '', condition);

      case 'spaces':
        if (Array.isArray(condition)) {
          return condition.some(space => entity.spaces.includes(space));
        }
        return false;

      case 'types':
        if (Array.isArray(condition)) {
          return condition.some(typeCondition => {
            return entity.types.some(entityType => {
              if (typeCondition.id && !this.matchesStringCondition(entityType.id as string, typeCondition.id)) {
                return false;
              }
              if (typeCondition.name && !this.matchesStringCondition(entityType.name || '', typeCondition.name)) {
                return false;
              }
              return true;
            });
          });
        }
        return false;

      case 'triples':
        return this.matchesTriples(entity.triples, condition);

      case 'relations':
        return this.matchesRelations(entity.relationsOut, condition);

      default:
        return false;
    }
  }

  /**
   * Check if any triples match the condition
   */
  private matchesTriples(triples: Triple[], condition: TripleCondition | TripleCondition[]): boolean {
    const conditions = Array.isArray(condition) ? condition : [condition];

    return conditions.some(cond => {
      return triples.some(triple => {
        // Check attributeName
        if (cond.attributeName && !this.matchesStringCondition(triple.attributeName || '', cond.attributeName)) {
          return false;
        }

        // Check attributeId
        if (cond.attributeId && !this.matchesStringCondition(triple.attributeId, cond.attributeId)) {
          return false;
        }

        // Check space
        if (cond.space && !this.matchesStringCondition(triple.space, cond.space)) {
          return false;
        }

        // Check valueType
        if (cond.valueType && triple.value.type !== cond.valueType) {
          return false;
        }

        // Check value
        if (cond.value) {
          if (triple.value.type === 'NUMBER') {
            const numValue = parseFloat(triple.value.value);
            if (isNaN(numValue) || !this.matchesNumberCondition(numValue, cond.value as NumberCondition)) {
              return false;
            }
          } else if (triple.value.type === 'CHECKBOX') {
            const boolValue = triple.value.value.toLowerCase() === 'true';
            if (!this.matchesBooleanCondition(boolValue, cond.value as BooleanCondition)) {
              return false;
            }
          } else {
            // TEXT, URL, TIME
            if (!this.matchesStringCondition(triple.value.value, cond.value as StringCondition)) {
              return false;
            }
          }
        }

        return true;
      });
    });
  }

  /**
   * Check if any relations match the condition
   */
  private matchesRelations(relations: Relation[], condition: RelationCondition | RelationCondition[]): boolean {
    const conditions = Array.isArray(condition) ? condition : [condition];

    return conditions.some(cond => {
      return relations.some(relation => {
        // Check typeOf.id
        if (cond.typeOf?.id && !this.matchesStringCondition(relation.typeOf.id as string, cond.typeOf.id)) {
          return false;
        }

        // Check typeOf.name
        if (cond.typeOf?.name && !this.matchesStringCondition(relation.typeOf.name || '', cond.typeOf.name)) {
          return false;
        }

        // Check toEntity.id
        if (cond.toEntity?.id && !this.matchesStringCondition(relation.toEntity.id as string, cond.toEntity.id)) {
          return false;
        }

        // Check toEntity.name
        if (cond.toEntity?.name && !this.matchesStringCondition(relation.toEntity.name || '', cond.toEntity.name)) {
          return false;
        }

        // Check space
        if (cond.space && !this.matchesStringCondition(relation.space, cond.space)) {
          return false;
        }

        return true;
      });
    });
  }

  /**
   * Check if a string matches a string condition
   */
  private matchesStringCondition(value: string, condition: StringCondition): boolean {
    if (typeof condition === 'string') {
      return compareOperators.string.equals(value, condition);
    }

    if (condition.equals !== undefined) {
      if (!compareOperators.string.equals(value, condition.equals)) {
        return false;
      }
    }

    if (condition.contains !== undefined) {
      if (!compareOperators.string.contains(value, condition.contains)) {
        return false;
      }
    }

    if (condition.startsWith !== undefined) {
      if (!compareOperators.string.startsWith(value, condition.startsWith)) {
        return false;
      }
    }

    if (condition.endsWith !== undefined) {
      if (!compareOperators.string.endsWith(value, condition.endsWith)) {
        return false;
      }
    }

    if (condition.in !== undefined) {
      if (!condition.in.includes(value)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a number matches a number condition
   */
  private matchesNumberCondition(value: number, condition: NumberCondition): boolean {
    if (typeof condition === 'number') {
      return compareOperators.number.equals(value, condition);
    }

    if (condition.equals !== undefined) {
      if (!compareOperators.number.equals(value, condition.equals)) {
        return false;
      }
    }

    if (condition.gt !== undefined) {
      if (!compareOperators.number.gt(value, condition.gt)) {
        return false;
      }
    }

    if (condition.gte !== undefined) {
      if (!compareOperators.number.gte(value, condition.gte)) {
        return false;
      }
    }

    if (condition.lt !== undefined) {
      if (!compareOperators.number.lt(value, condition.lt)) {
        return false;
      }
    }

    if (condition.lte !== undefined) {
      if (!compareOperators.number.lte(value, condition.lte)) {
        return false;
      }
    }

    if (condition.between !== undefined) {
      if (!compareOperators.number.between(value, condition.between)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a boolean matches a boolean condition
   */
  private matchesBooleanCondition(value: boolean, condition: BooleanCondition): boolean {
    if (typeof condition === 'boolean') {
      return compareOperators.boolean.equals(value, condition);
    }

    if (condition.equals !== undefined) {
      return compareOperators.boolean.equals(value, condition.equals);
    }

    return true;
  }

  /**
   * Apply sorting to entities
   */
  private applySorting(entities: Entity[]): Entity[] {
    return [...entities].sort((a, b) => {
      for (const sortOption of this.sortByVal) {
        const field = typeof sortOption === 'string' ? sortOption : sortOption.field;
        const direction = typeof sortOption === 'string' ? 'asc' : sortOption.direction;
        const multiplier = direction === 'asc' ? 1 : -1;

        let valueA: any;
        let valueB: any;

        switch (field) {
          case 'id':
            valueA = a.id as string;
            valueB = b.id as string;
            break;
          case 'name':
            valueA = a.name || '';
            valueB = b.name || '';
            break;
          case 'description':
            valueA = a.description || '';
            valueB = b.description || '';
            break;
          default:
            valueA = '';
            valueB = '';
        }

        if (valueA < valueB) return -1 * multiplier;
        if (valueA > valueB) return 1 * multiplier;
      }

      return 0;
    });
  }

  /**
   * Apply pagination to entities
   */
  private applyPagination(entities: Entity[]): Entity[] {
    const start = this.offsetVal;
    const end = this.limitVal ? start + this.limitVal : undefined;
    return entities.slice(start, end);
  }

  /**
   * Apply field selection to entities
   */
  private applyFieldSelection(entities: Entity[]): any[] {
    return entities.map(entity => {
      const result: any = {};

      for (const field of this.selectFields) {
        switch (field) {
          case 'id':
            result.id = entity.id;
            break;
          case 'name':
            result.name = entity.name;
            break;
          case 'description':
            result.description = entity.description;
            break;
          case 'types':
            result.types = entity.types;
            break;
          case 'spaces':
            result.spaces = entity.spaces;
            break;
          case 'triples':
            result.triples = entity.triples;
            break;
          case 'relationsOut':
            result.relationsOut = entity.relationsOut;
            break;
        }
      }

      return result;
    });
  }
}

/**
 * Entity Query Builder factory
 */
export class EntityQueryBuilder {
  private store: GeoStore;

  constructor(store: GeoStore) {
    this.store = store;
  }

  /**
   * Create a new query
   */
  query(): EntityQuery {
    return new EntityQuery(this.store);
  }

  /**
   * Find all entities
   */
  findAll(): Entity[] {
    return this.query().execute();
  }

  /**
   * Find an entity by ID
   */
  findById(id: EntityId): Promise<Entity | null> {
    return this.query().findById(id);
  }

  /**
   * Find entities by name
   */
  findByName(name: string): Entity[] {
    return this.query().whereName({ contains: name }).execute();
  }

  /**
   * Find entities by full-text search across name and description
   */
  search(text: string): Entity[] {
    return this.query()
      .orWhere([
        { name: { contains: text } },
        { description: { contains: text } },
        { triples: { value: { contains: text } } },
      ])
      .execute();
  }

  /**
   * Find entities by type name
   */
  findByType(typeName: string): Entity[] {
    return this.query()
      .whereType({ name: { contains: typeName } })
      .execute();
  }

  /**
   * Find entities that have a specific property (triple)
   */
  findByProperty(propertyName: string, value?: string): Entity[] {
    const condition: TripleCondition = { attributeName: { contains: propertyName } };
    if (value !== undefined) {
      condition.value = { contains: value };
    }
    return this.query().whereTriple(condition).execute();
  }

  /**
   * Find entities that have a relation to another entity
   */
  findByRelation(targetEntityId: EntityId): Entity[] {
    return this.query()
      .whereRelation({ toEntity: { id: { equals: targetEntityId } } })
      .execute();
  }

  /**
   * Find entities that have a specific relation type
   */
  findByRelationType(relationTypeName: string): Entity[] {
    return this.query()
      .whereRelation({ typeOf: { name: { contains: relationTypeName } } })
      .execute();
  }
}

/**
 * Create a query builder for the given store
 */
export function createQueryBuilder(store: GeoStore): EntityQueryBuilder {
  return new EntityQueryBuilder(store);
}

/**
 * Usage examples:
 *
 * const { store } = useSyncEngine();
 * const queryBuilder = createQueryBuilder(store);
 *
 * // Find all entities
 * const allEntities = await queryBuilder.findAll();
 *
 * // Find an entity by ID
 * const entity = await queryBuilder.findById('entity1');
 *
 * // Find entities by name
 * const companies = await queryBuilder.findByName('Company');
 *
 * // Search entities by text
 * const searchResults = await queryBuilder.search('sample');
 *
 * // Complex query
 * const results = await queryBuilder.query()
 *   .whereType({ name: 'Person' })
 *   .whereTriple({ attributeName: 'role', value: 'CEO' })
 *   .sortBy('name')
 *   .limit(10)
 *   .execute();
 *
 * // Query with OR condition
 * const nameOrDescriptionMatches = await queryBuilder.query()
 *   .orWhere([
 *     { name: { contains: 'Company' } },
 *     { description: { contains: 'Project' } }
 *   ])
 *   .execute();
 */
