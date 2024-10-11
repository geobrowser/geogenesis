import { Effect } from 'effect';

import { type OpWithCreatedBy } from './map-triples';
import { Triples } from '~/sink/db';

interface PopulateTriplesArgs {
  schemaTriples: OpWithCreatedBy[];
}

/**
 * Handles writing triples to the database. At this point any triples from previous versions
 * of an entity are already part of the schemaTriples list, so this function just writes them.
 */
export function writeTriples({ schemaTriples }: PopulateTriplesArgs) {
  return Effect.gen(function* (_) {
    yield* _(
      Effect.tryPromise({
        try: () =>
          Triples.upsert(
            schemaTriples.filter(t => t.op === 'SET_TRIPLE').map(op => op.triple),
            { chunked: true }
          ),
        catch: error => new Error(`Failed to insert bulk triples. ${(error as Error).message}`),
      })
    );

    /**
     * Changes to data in Geo are modeled as "operations (ops)." You can create a triple or delete a triple.
     *
     * Set operations applied to a given triple are considered "upserts." Additionally, a triple is unique for
     * a given database by its (Space, Entity, Attribute) id tuple.
     */
    // for (const { op, triple, createdById } of schemaTriples) {
    //   const isUpsertTriple = op === 'SET_TRIPLE';
    //   const isDeleteTriple = op === 'DELETE_TRIPLE';

    //   const isAddTypeViaTriple = triple.attribute_id === SYSTEM_IDS.TYPES && isUpsertTriple && triple.entity_value_id;
    //   const isDeleteTypeViaTriple = triple.attribute_id === SYSTEM_IDS.TYPES && isDeleteTriple;

    //   const isStringValueType = triple.value_type === 'TEXT';

    //   /**
    //    * @TODO(bug): There's a bug here where we might create a triple_version for a triple that gets
    //    * deleted later on in the same actions processing loop. If we squash ahead of time this
    //    * shouldn't be an issue.
    //    */
    //   if (isUpsertTriple) {
    //     yield* _(upsertEntitySpace({ space_id: triple.space_id, entity_id: triple.entity_id }), retryEffect);
    //   }

    //   /**
    //    * We don't delete triples. Instead we store all triples ever created over time. We need
    //    * to track these so we can look at historical state for entities. We do remove them from
    //    * any new versions.
    //    *
    //    * Here we remove the triple from the current if it was deleted.
    //    */
    //   if (isDeleteTriple) {
    //     /**
    //      * If the deleted triple is the last triple for an entity in a space, we need to delete
    //      * the entity space from the public.entity_spaces table.
    //      */
    //     yield* _(maybeDeleteEntitySpace({ space_id: triple.space_id, entity_id: triple.entity_id }), retryEffect);
    //   }

    //   /**
    //    * If an entity has a type added to it then there are several side-effects we need to trigger.
    //    * There's probably a better way to do this in SQL using triggers
    //    */
    //   if (isAddTypeViaTriple) {
    //     yield* _(upsertEntityType(triple, block), retryEffect);

    //     // Relations are given types: Relation as a triple instead of a relation. This is to avoid
    //     // a recursive entity creation loop if we try to add a relation to a relation entity.
    //     if (triple.entity_value_id === SYSTEM_IDS.RELATION_TYPE) {
    //       const schemaRelation = getRelationTriplesFromSchemaTriples(schemaTriples, triple.entity_id.toString());

    //       // If we have a valid relation entity, we add it to the public.relations table.
    //       // if (schemaRelation) {
    //       //   yield* _(upsertRelation(schemaRelation), retryEffect);

    //       //   // Write any relations with Relation type -> Types to the types table
    //       //   if (schemaRelation.type_of_id === SYSTEM_IDS.TYPES) {
    //       //     yield* _(upsertEntityTypeViaRelation(schemaRelation, block), retryEffect);

    //       //     // Additionally, if this relation defines a type of space configuration we add it to the
    //       //     // public.spaces_metadata table.
    //       //     if (schemaRelation.to_entity_id === SYSTEM_IDS.SPACE_CONFIGURATION) {
    //       //       yield* _(upsertSpaceMetadata(schemaRelation, triple.space_id.toString()), retryEffect);
    //       //     }
    //       //   }
    //       // }
    //     }

    //     // Update the relation row if we change any of the values. At this point the
    //     // triple has already been inserted, we just need to update the relation itself
    //     // with the new relation values.
    //     //
    //     // Currently (Aug 05, 2024) only the index changes ad-hoc. The other triples are
    //     // only ever created or deleted at the time of creating or deleting the entire relation.
    //     if (triple.attribute_id === SYSTEM_IDS.RELATION_INDEX) {
    //       yield* _(updateRelationIndex(triple), retryEffect);
    //     }
    //   }

    //   /**
    //    * If an entity has a type removed from it then there are several side-effects we need to trigger.
    //    *
    //    * There's probably a better way to do this in SQL with triggers.
    //    */
    //   if (isDeleteTypeViaTriple) {
    //     yield* _(deleteEntityType(triple), retryEffect);

    //     // If the deleted type is a Relation then we need to remove it from the public.relations table.
    //     if (triple.entity_value_id === SYSTEM_IDS.RELATION_TYPE) {
    //       const relation = yield* _(Effect.promise(() => Relations.selectOne({ id: triple.entity_id })));

    //       if (!relation) {
    //         slog({
    //           message: `Failed to find relation with id ${triple.entity_id}`,
    //           requestId: block.requestId,
    //           level: 'error',
    //         });

    //         continue;
    //       }

    //       yield* _(deleteRelation(relation.id), retryEffect);

    //       // If the relation defines a type for an entity we need to delete that type from the public.entity_types table.
    //       if (relation?.type_of_id === SYSTEM_IDS.TYPES) {
    //         yield* _(deleteEntityTypeViaRelation(relation), retryEffect);

    //         // If the type is space configuration we need to delete it from the public.spaces_metadata table.
    //         if (relation.to_entity_id === SYSTEM_IDS.SPACE_CONFIGURATION) {
    //           yield* _(deleteSpaceMetadata(relation, triple.space_id.toString()), retryEffect);
    //         }
    //       }
    //     }
    //   }
    // }
  });
}
