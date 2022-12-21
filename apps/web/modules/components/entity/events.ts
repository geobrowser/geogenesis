import { EntityStore } from '~/modules/stores/entity-store';
import { useEntityTriples } from '~/modules/stores/use-entity-triples';
import { Triple, Value } from '~/modules/types';

type EntityEditAction =
  | { type: 'SET_ENTITY_NAME'; name: string }
  | { type: 'SET_ENTITY_DESCRIPTION'; description: string }
  | { type: 'SET_ENTITY_ATTRIBUTE_VALUE'; payload: { attributeId: string; value: Value } }
  | { type: 'SET_ENTITY_ATTRIBUTE'; payload: { attributeId: string; attributeName: string } }
  | { type: 'SET_ENTITY_VALUE_TYPE'; payload: { valueType: Value['type'] } }
  | { type: 'DELETE_TRIPLE'; tripleId: string };

type APIs = {
  create: EntityStore['create'];
  update: EntityStore['update'];
  delete: EntityStore['remove'];
};

export function updateEntity(action: EntityEditAction, triples: Triple, apis: APIs) {
  switch (action.type) {
    case 'SET_ENTITY_NAME':
      return apis.update();
  }
}
