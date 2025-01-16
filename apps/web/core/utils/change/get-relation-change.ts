import { Relation } from '~/core/types';

import { RelationChangeValue } from './types';

/**
 * Changes are scoped to either the left side of the diff or the right side of the diff.
 *
 * This function returns what the change should be represented as for the left side of the diff.
 *
 * If a relation is added or removed, the change is represented as an `ADD` or `REMOVE` change.
 * If the relation is updated, e.g., the value of the `toEntity` changes, the change is
 * represented as an `UPDATE` change.
 */

export const AfterRelationDiff = {
  diffBefore(afterRelation: Relation, beforeRelations: Relation[] | null): RelationChangeValue | null {
    if (beforeRelations === null) {
      return null;
    }

    const maybeRemoteRelationWithSameId = beforeRelations.find(r => r.id === afterRelation.id);

    if (!maybeRemoteRelationWithSameId) {
      return null;
    }

    // @TODO: An update relation can't really ever happen due to the way relations work
    if (afterRelation.toEntity.value !== maybeRemoteRelationWithSameId.toEntity.value) {
      return {
        value: maybeRemoteRelationWithSameId.toEntity.value,
        valueName: maybeRemoteRelationWithSameId.toEntity.name,
        type: 'UPDATE',
      };
    }

    return {
      value: maybeRemoteRelationWithSameId.toEntity.value,
      valueName: maybeRemoteRelationWithSameId.toEntity.name,
      type: 'REMOVE',
    };
  },
  diffAfter(afterRelation: Relation, beforeRelations: Relation[] | null): RelationChangeValue | null {
    if (afterRelation.toEntity.value === '') {
      return null;
    }

    if (beforeRelations === null) {
      return {
        value: afterRelation.toEntity.value,
        valueName: afterRelation.toEntity.name,
        type: 'ADD',
      };
    }

    const maybeRemoteRelationWithSameId = beforeRelations.find(r => r.id === afterRelation.id);

    if (!maybeRemoteRelationWithSameId) {
      return {
        value: afterRelation.toEntity.value,
        valueName: afterRelation.toEntity.name,
        type: 'ADD',
      };
    }

    // @TODO: An update relation can't really ever happen due to the way relations work
    if (afterRelation.toEntity.value !== maybeRemoteRelationWithSameId.toEntity.value) {
      return {
        value: afterRelation.toEntity.value,
        valueName: afterRelation.toEntity.name,
        type: 'UPDATE',
      };
    }

    return {
      value: afterRelation.toEntity.value,
      valueName: afterRelation.toEntity.name,
      type: 'ADD',
    };
  },
};

export const BeforeRelationDiff = {
  diffBefore(beforeRelation: Relation, afterRelations: Relation[] | null): RelationChangeValue | null {
    if (afterRelations === null) {
      return null;
    }

    const maybeRemoteRelationWithSameId = afterRelations.find(r => r.id === beforeRelation.id);

    if (!maybeRemoteRelationWithSameId) {
      return null;
    }

    // @TODO: An update relation can't really ever happen due to the way relations work
    if (beforeRelation.toEntity.value !== maybeRemoteRelationWithSameId.toEntity.value) {
      return {
        value: maybeRemoteRelationWithSameId.toEntity.value,
        valueName: maybeRemoteRelationWithSameId.toEntity.name,
        type: 'UPDATE',
      };
    }

    return {
      value: beforeRelation.toEntity.value,
      valueName: beforeRelation.toEntity.name,
      type: 'REMOVE',
    };
  },
  diffAfter(beforeRelation: Relation, afterRelations: Relation[] | null): RelationChangeValue {
    if (afterRelations === null) {
      return {
        value: beforeRelation.toEntity.value,
        valueName: beforeRelation.toEntity.name,
        type: 'REMOVE',
      };
    }

    const maybeRemoteRelationWithSameId = afterRelations.find(r => r.id === beforeRelation.id);

    if (!maybeRemoteRelationWithSameId) {
      return {
        value: beforeRelation.toEntity.value,
        valueName: beforeRelation.toEntity.name,
        type: 'REMOVE',
      };
    }

    // @TODO: An update relation can't really ever happen due to the way relations work
    if (beforeRelation.toEntity.value !== maybeRemoteRelationWithSameId.toEntity.value) {
      return {
        value: maybeRemoteRelationWithSameId.toEntity.value,
        valueName: maybeRemoteRelationWithSameId.toEntity.name,
        type: 'UPDATE',
      };
    }

    return {
      value: maybeRemoteRelationWithSameId.toEntity.value,
      valueName: maybeRemoteRelationWithSameId.toEntity.name,
      type: 'REMOVE',
    };
  },
};
