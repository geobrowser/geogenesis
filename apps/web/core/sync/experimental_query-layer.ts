import { Entity, Relation, Value } from '../v2.types';

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
export type StringCondition = {
  equals?: string;
  fuzzy?: string;
  contains?: string;
  startsWith?: string;
  endsWith?: string;
  in?: string[];
};

export type NumberCondition = {
  equals?: number;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  between?: [number, number];
};

export type BooleanCondition = { equals: boolean };

export type ValueCondition = {
  propertyName?: StringCondition;
  propertyId?: StringCondition;
  value?: StringCondition | NumberCondition | BooleanCondition;
  dataType?: 'TEXT' | 'URL' | 'TIME' | 'CHECKBOX' | 'NUMBER';
  space?: StringCondition;
};

export type RelationCondition = {
  typeOf?: { id?: StringCondition; name?: StringCondition };
  fromEntity?: { id?: StringCondition; name?: StringCondition };
  toEntity?: { id?: StringCondition; name?: StringCondition };
  space?: StringCondition;
};

export type BacklinkCondition = {
  typeOf?: { id?: StringCondition; name?: StringCondition };
  fromEntity?: { id?: StringCondition; name?: StringCondition };
  space?: StringCondition;
};

export type WhereCondition = {
  id?: StringCondition;
  name?: StringCondition;
  description?: StringCondition;
  types?: { id?: StringCondition; name?: StringCondition }[];
  spaces?: StringCondition[];
  space?: { id?: StringCondition };
  values?: ValueCondition[];
  relations?: RelationCondition[];
  backlinks?: BacklinkCondition[];
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
  private entities: Entity[];
  private whereConditions: WhereCondition[] = [];
  private limitVal: number | undefined;
  private offsetVal: number = 0;
  private sortByVal: SortBy[] = [];
  private selectFields: string[] = [];

  constructor(entities: typeof this.entities) {
    this.entities = entities;
  }

  /**
   * Add a where condition to the query
   */
  where(condition: WhereCondition): EntityQuery {
    this.whereConditions = [condition];
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
    const allEntities = this.entities;

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

    return filteredEntities;
  }

  /**
   * Execute the query and return the first result or null
   */
  findFirst(): Entity | null {
    const results = this.limit(1).execute();
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Execute the query and return a single result or throw an error if not found
   */
  findOne(): Entity {
    const entity = this.findFirst();
    if (!entity) {
      throw new Error('Entity not found');
    }
    return entity;
  }

  /**
   * Count the number of entities that match the query
   */
  count(): number {
    const results = this.execute();
    return results.length;
  }

  /**
   * Check if any entities match the query
   */
  exists(): boolean {
    const count = this.count();
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
      // Check all conditions (implicit AND between multiple where calls)
      return this.whereConditions.every(condition => this.matchesCondition(entity, condition));
    });
  }

  /**
   * Check if an entity matches a condition
   */
  private matchesCondition(entity: Entity, condition: WhereCondition): boolean {
    // @TODO: We can just filter _all_ fields individually then return entities rather than M*N filtering we're currently
    // doing where we filter entities and their relations one at a time
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
        return this.matchesStringCondition(entity.id, condition);

      case 'name':
        return this.matchesStringCondition(entity.name || '', condition);

      case 'description':
        return this.matchesStringCondition(entity.description || '', condition);

      case 'spaces':
        // Temporarily disabled until we have property space ids
        return true;
      // if (condition === undefined) {
      //   return true;
      // }

      // if (Array.isArray(condition)) {
      //   const clause = condition as StringCondition[];
      //   return clause.some(space => space.equals && entity.spaces.includes(space.equals));
      // }
      // return false;

      case 'types':
        if (condition === undefined) {
          return true;
        }

        if (Array.isArray(condition)) {
          return condition.some(typeCondition => {
            return entity.types.some(entityType => {
              if (typeCondition.id && !this.matchesStringCondition(entityType.id, typeCondition.id)) {
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

      case 'values':
        return this.matchesValues(entity.values, condition);

      case 'relations': {
        return this.matchesRelations(entity.relations, condition);
      }

      case 'backlinks': {
        return this.matchesBacklinks(entity, condition);
      }

      default:
        return false;
    }
  }

  /**
   * Check if any values match the condition
   */
  private matchesValues(values: Value[], condition: ValueCondition | ValueCondition[]): boolean {
    const conditions = Array.isArray(condition) ? condition : [condition];

    return conditions.some(cond => {
      return values.some(value => {
        // Check attributeName
        if (cond.propertyName && !this.matchesStringCondition(value.property.name || '', cond.propertyName)) {
          return false;
        }

        // Check attributeId
        if (cond.propertyId && !this.matchesStringCondition(value.property.id, cond.propertyId)) {
          return false;
        }

        // Check space
        if (cond.space && !this.matchesStringCondition(value.spaceId, cond.space)) {
          return false;
        }

        // Check valueType
        if (cond.dataType && value.property.dataType !== cond.dataType) {
          return false;
        }

        // Check value
        if (cond.value) {
          if (value.property.dataType === 'NUMBER') {
            const numValue = parseFloat(value.value);
            if (isNaN(numValue) || !this.matchesNumberCondition(numValue, cond.value as NumberCondition)) {
              return false;
            }
          } else if (value.property.dataType === 'CHECKBOX') {
            const boolValue = value.value.toLowerCase() === 'true';
            if (!this.matchesBooleanCondition(boolValue, cond.value as BooleanCondition)) {
              return false;
            }
          } else {
            // TEXT, URL, TIME
            if (!this.matchesStringCondition(value.value, cond.value as StringCondition)) {
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

    return conditions.every(cond => {
      return relations.some(relation => {
        // Check typeOf.id
        if (cond.typeOf?.id && !this.matchesStringCondition(relation.type.id as string, cond.typeOf.id)) {
          return false;
        }

        // Check typeOf.name
        if (cond.typeOf?.name && !this.matchesStringCondition(relation.type.name || '', cond.typeOf.name)) {
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
        if (cond.space && !this.matchesStringCondition(relation.spaceId, cond.space)) {
          return false;
        }

        return true;
      });
    });
  }

  /**
   * Check if any backlinks match the condition
   */
  private matchesBacklinks(entity: Entity, condition: BacklinkCondition | BacklinkCondition[]): boolean {
    const conditions = Array.isArray(condition) ? condition : [condition];

    return conditions.some(cond => {
      return this.entities.some(otherEntity => {
        return otherEntity.relations.some(relation => {
          // Check if this relation points TO the current entity
          if (relation.toEntity.id !== entity.id) {
            return false;
          }

          // Check typeOf.id
          if (cond.typeOf?.id && !this.matchesStringCondition(relation.type.id as string, cond.typeOf.id)) {
            return false;
          }

          // Check typeOf.name
          if (cond.typeOf?.name && !this.matchesStringCondition(relation.type.name || '', cond.typeOf.name)) {
            return false;
          }

          // Check fromEntity.id
          if (cond.fromEntity?.id && !this.matchesStringCondition(relation.fromEntity.id, cond.fromEntity.id)) {
            return false;
          }

          // Check fromEntity.name
          if (cond.fromEntity?.name && !this.matchesStringCondition(relation.fromEntity.name || '', cond.fromEntity.name)) {
            return false;
          }

          // Check space
          if (cond.space && !this.matchesStringCondition(relation.spaceId, cond.space)) {
            return false;
          }

          return true;
        });
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
      // @TODO For now we use startsWith as equals to match the previous behavior
      // of filters
      if (!compareOperators.string.startsWith(value, condition.equals)) {
        return false;
      }
    }

    if (condition.fuzzy !== undefined) {
      if (!compareOperators.string.contains(value, condition.fuzzy)) {
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
}
