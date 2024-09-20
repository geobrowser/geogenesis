import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Effect } from 'effect';
import { dedupeWith } from 'effect/ReadonlyArray';
import type * as Schema from 'zapatos/schema';

import { Entities, Types, VersionSpaces, Versions } from '../db';
import { Relations } from '../db/relations';
import { aggregateRelations } from '../events/aggregate-relations';
import {
  type OpWithCreatedBy,
  type SchemaTripleEdit,
  mapSchemaTriples,
} from '../events/proposal-processed/map-triples';
import { populateTriples } from '../events/proposal-processed/populate-triples';
import type { BlockEvent, Op } from '../types';

interface PopulateContentArgs {
  versions: Schema.versions.Insertable[];
  opsByVersionId: Map<string, Op[]>;
  edits: Schema.edits.Insertable[];
  block: BlockEvent;
}

export function populateContent(args: PopulateContentArgs) {
  const { versions, opsByVersionId, edits, block } = args;
  const spaceIdByEditId = new Map<string, string>();

  for (const edit of edits) {
    spaceIdByEditId.set(edit.id.toString(), edit.space_id.toString());
  }

  const entities: Schema.entities.Insertable[] = [];
  const triplesWithCreatedBy: OpWithCreatedBy[] = [];
  const versionsWithMetadata: Schema.versions.Insertable[] = [];
  const versionSpaces: Schema.version_spaces.Insertable[] = [];

  return Effect.gen(function* (awaited) {
    // We might get multiple proposals at once in the same block that change the same set of entities.
    // We need to make sure that we process the proposals in order to avoid conflicts when writing to
    // the DB as well as to make sure we preserve the proposal ordering as they're received from the chain.
    for (const version of versions) {
      const entity: Schema.entities.Insertable = {
        id: version.entity_id,
        created_by_id: version.created_by_id,
        created_at: block.timestamp,
        created_at_block: block.blockNumber,
        updated_at: block.timestamp,
        updated_at_block: block.blockNumber,
      };

      entities.push(entity);

      const editWithCreatedById: SchemaTripleEdit = {
        versonId: version.id.toString(),
        createdById: version.created_by_id.toString(),
        spaceId: spaceIdByEditId.get(version.edit_id.toString())!,
        // @TODO: These can just be passed into the function as OpsWithCreatedBy instead of Ops
        ops: opsByVersionId.get(version.id.toString()) ?? [],
      };

      const triplesForVersion = mapSchemaTriples(editWithCreatedById, block);
      triplesWithCreatedBy.push(...triplesForVersion);

      // @TODO: Derive name, cover, types, spaces from triples and relations
      const setTriples = triplesForVersion.filter(t => t.op === 'SET_TRIPLE');
      const nameTriple = setTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.NAME);
      const descriptionTriple = setTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.DESCRIPTION);

      const name = nameTriple?.triple.text_value?.toString();
      const description = descriptionTriple?.triple.text_value?.toString();

      versionsWithMetadata.push({
        ...version,
        name,
        description,
      } satisfies Schema.versions.Insertable);

      // @TODO: Get spaces for versions
      const spaces = triplesForVersion.reduce(
        (acc, t) => {
          acc.set(version.id.toString(), t.triple.space_id.toString());
          return acc;
        },
        // version id -> space id
        new Map<string, string>()
      );

      for (const [versionId, spaceId] of spaces.entries()) {
        versionSpaces.push({
          version_id: versionId,
          space_id: spaceId,
        });
      }
    }

    const uniqueEntities = dedupeWith(entities, (a, b) => a.id.toString() === b.id.toString());
    const relations = yield* awaited(aggregateRelations({ triples: triplesWithCreatedBy, versions, edits }));

    // @TODO: Get types for versions. Types can come either from triples or from relations
    // @TODO: Get space metadata
    // @TODO: Update relation index

    yield* awaited(
      Effect.all([
        Effect.tryPromise({
          try: () => Versions.upsertMetadata(versionsWithMetadata),
          catch: error => new Error(`Failed to insert versions with metadata. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          // We update the name and description for an entity when mapping
          // through triples.
          try: () => Entities.upsert(uniqueEntities),
          catch: error => new Error(`Failed to insert entities. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () => VersionSpaces.upsert(versionSpaces),
          catch: error => new Error(`Failed to insert version spaces. ${(error as Error).message}`),
        }),
        populateTriples({
          schemaTriples: triplesWithCreatedBy,
        }),
        Effect.tryPromise({
          try: () => Relations.upsert(relations, { chunked: true }),
          catch: error => new Error(`Failed to insert relations. ${(error as Error).message}`),
        }),
      ])
    );

    // We run this after versions are written so that we can fetch all of the types for the
    // type entity and compare them against the type_of_id version for each relatons to see
    // of the type_of_id is for the type entity.
    const versionTypes = yield* awaited(
      aggregateTypesFromRelationsAndTriples({ relations, triples: triplesWithCreatedBy })
    );

    yield* awaited(
      Effect.tryPromise({
        try: () => Types.upsert(versionTypes),
        catch: error => new Error(`Failed to insert version types. ${(error as Error).message}`),
      })
    );
  });
}

interface AggregateTypesFromRelationsAndTriplesArgs {
  relations: Schema.relations.Insertable[];
  triples: OpWithCreatedBy[];
}

function aggregateTypesFromRelationsAndTriples({ relations, triples }: AggregateTypesFromRelationsAndTriplesArgs) {
  return Effect.gen(function* (_) {
    const types = new Map<string, string[]>();
    const typeVersions = new Set(
      (yield* _(Effect.promise(() => Versions.select({ entity_id: SYSTEM_IDS.TYPES })))).map(v => v.id)
    );

    for (const relation of relations) {
      const fromVersionId = relation.from_version_id.toString();
      const toVersionId = relation.to_version_id.toString();

      if (typeVersions.has(relation.type_of_id.toString())) {
        const alreadyFoundTypes = types.get(fromVersionId) ?? [];
        types.set(fromVersionId, [...alreadyFoundTypes, toVersionId]);
      }
    }

    for (const { triple } of triples.filter(t => t.op === 'SET_TRIPLE')) {
      if (triple.value_type === 'ENTITY' && triple.attribute_id === SYSTEM_IDS.TYPES) {
        // @TODO: Triple entity values should be version_values that point to a version
        // and not an entity.
        const type = triple.entity_value_id?.toString();

        if (type) {
          const versionId = triple.version_id.toString();
          const alreadyFoundTypes = types.get(versionId) ?? [];

          types.set(versionId, [...alreadyFoundTypes, type]);
        }
      }
    }

    return [...types.entries()].flatMap(([versionId, typeIds]) => {
      return typeIds.map((typeId): Schema.version_types.Insertable => {
        return {
          type_id: typeId,
          version_id: versionId,
        };
      });
    });
  });
}
