import type * as S from 'zapatos/schema';

import { TripleAction, type TripleWithActionTuple } from '~/sink/types';
import { generateTripleId, generateTripleIdV2 } from '~/sink/utils/id';
import type { Action } from '~/sink/zod';

export function mapTriplesWithActionType(
  entries: { space: string; actions: Action[] }[],
  timestamp: number,
  blockNumber: number
): TripleWithActionTuple[] {
  const triples: TripleWithActionTuple[] = entries.flatMap(e => {
    return e.actions.map(action => {
      const action_type = action.type;

      const entity_id = action.entityId;
      const attribute_id = action.attributeId;
      const value_type = action.value.type;
      const value_id = action.value.id;
      const space_id = e.space;

      const id = generateTripleId({
        space_id,
        entity_id,
        attribute_id,
        value_id,
      });

      const entity_value_id = value_type === 'entity' ? value_id : null;
      const collection_value_id = value_type === 'collection' ? value_id : null;

      const string_value =
        value_type === 'string' || value_type === 'image' || value_type === 'date' || value_type === 'url'
          ? action.value.value
          : null;

      const tupleType = action_type === 'deleteTriple' ? TripleAction.Delete : TripleAction.Create;

      return [
        tupleType,
        {
          id,
          entity_id,
          attribute_id,
          value_id,
          value_type,
          entity_value_id,
          string_value,
          space_id,
          created_at: timestamp,
          created_at_block: blockNumber,
          collection_value_id,
          is_stale: false,
        },
      ] as TripleWithActionTuple;
    });
  });

  return triples;
}

interface TripleWithActionV2 {
  createdById: string;
  operation: TripleAction;
  triple: S.triples.Insertable;
}

// @TODO: Do we squash actions in the new data model?
export function mapTriplesWithActionTypeV2(
  entries: { space: string; actions: Action[]; createdById: string }[],
  timestamp: number,
  blockNumber: number
): TripleWithActionV2[] {
  const triples = entries.flatMap(e => {
    return e.actions.map(action => {
      const action_type = action.type;

      const entity_id = action.entityId;
      const attribute_id = action.attributeId;
      const value_type = action.value.type;
      const value_id = action.value.id;
      const space_id = e.space;

      const id = generateTripleIdV2({
        space_id,
        entity_id,
        attribute_id,
      });

      const entity_value_id = value_type === 'entity' ? value_id : null;
      const collection_value_id = value_type === 'collection' ? value_id : null;

      const string_value =
        value_type === 'string' || value_type === 'image' || value_type === 'date' || value_type === 'url'
          ? action.value.value
          : null;

      const operation = action_type === 'deleteTriple' ? TripleAction.Delete : TripleAction.Upsert;

      return {
        createdById: e.createdById,
        operation,
        triple: {
          id,
          entity_id,
          attribute_id,
          value_id,
          value_type,
          entity_value_id,
          string_value,
          space_id,
          created_at: timestamp,
          created_at_block: blockNumber,
          collection_value_id,
          is_stale: false,
        },
      };
    });
  });

  return triples;
}
