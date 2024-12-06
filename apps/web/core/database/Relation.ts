import { INITIAL_RELATION_INDEX_VALUE } from '@geogenesis/sdk/constants';

import { EntityId } from '../io/schema';
import { RenderableEntityType } from '../types';
import { StoreRelation } from './types';

interface BaseRelation {
  space: string;
  index?: string;
  typeOf: {
    id: string;
    name: string | null;
  };
  fromEntity: {
    id: string;
    name: string | null;
  };
  toEntity: {
    id: string;
    name: string | null;
    renderableType?: RenderableEntityType;
    value: string; // @TODO images
  };
}

export class Relation {
  static make(baseRelation: BaseRelation): StoreRelation {
    return {
      space: baseRelation.space,
      index: baseRelation.index ?? INITIAL_RELATION_INDEX_VALUE,
      typeOf: {
        id: EntityId(baseRelation.typeOf.id),
        name: baseRelation.typeOf.name,
      },
      fromEntity: {
        id: EntityId(baseRelation.fromEntity.id),
        name: null,
      },
      toEntity: {
        id: EntityId(baseRelation.toEntity.id),
        name: baseRelation.toEntity.name,
        renderableType: baseRelation.toEntity.renderableType ?? 'RELATION',
        value: baseRelation.toEntity.value, // @TODO(relations): Add support for writing images
      },
    };
  }
}
