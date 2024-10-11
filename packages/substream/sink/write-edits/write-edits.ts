import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Effect, Either } from 'effect';
import { dedupeWith } from 'effect/ReadonlyArray';
import type * as Schema from 'zapatos/schema';

import { Entities, SpaceMetadata, Types, VersionSpaces, Versions } from '../db';
import { Relations } from '../db/relations';
import type { BlockEvent, Op } from '../types';
import { aggregateRelations } from './aggregate-relations';
import { type OpWithCreatedBy, type SchemaTripleEdit, mapSchemaTriples } from './map-triples';
import { writeTriples } from './write-triples';

interface PopulateContentArgs {
  block: BlockEvent;
  versions: Schema.versions.Insertable[];
  opsByVersionId: Map<string, Op[]>;
  /**
   * We pass in any imported edits to write to the db since we need to
   * write the imported edits as if they are a single atomic unit rather
   * than treating them as individual edits.
   *
   * This is mostly required for versioning to ensure that for non-imports
   * we scope version references to the edit they are created in. But for
   * imports there may be edits that reference edits in the same import.
   * These are all processed in the same block, so we need to aggregate the
   * versions as a single unit.
   */
  editType: 'IMPORT' | 'DEFAULT';
  edits: Schema.edits.Insertable[];
}

/**
 * We pass in any imported edits to write to the db since we need to
 * write the imported edits as if they are a single atomic unit rather
 * than treating them as individual edits.
 *
 * This is mostly required for versioning to ensure that for non-imports
 * we scope version references to the edit they are created in. But for
 * imports there may be edits that reference edits in the same import.
 * These are all processed in the same block, so we need to aggregate the
 * versions as a single unit.
 */
export function writeEdits(args: PopulateContentArgs) {
  const { versions, opsByVersionId, edits, block, editType } = args;
  const spaceIdByEditId = new Map<string, string>();

  for (const edit of edits) {
    spaceIdByEditId.set(edit.id.toString(), edit.space_id.toString());
  }

  const entities: Schema.entities.Insertable[] = [];
  const triplesWithCreatedBy: OpWithCreatedBy[] = [];
  const versionsWithMetadata: Schema.versions.Insertable[] = [];
  const versionSpaces: Schema.version_spaces.Insertable[] = [];

  return Effect.gen(function* (_) {
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
    const relations = yield* _(
      aggregateRelations({
        triples: triplesWithCreatedBy,
        versions,
        edits,
        editType,
      })
    );

    /**
     * 1. Write versions with primitive metadata (e.g., name, description)
     * 2. Write any new entities
     * 3. Write spaces that a version belongs to
     * 4. Write triples + relations
     */
    yield* _(
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
        writeTriples({
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
    const versionTypes = yield* _(aggregateTypesFromRelationsAndTriples({ relations, triples: triplesWithCreatedBy }));
    const spaceMetadata = yield* _(aggregateSpacesFromRelations(relations, versions, spaceIdByEditId));

    yield* _(
      Effect.tryPromise({
        try: () => Types.upsert(versionTypes),
        catch: error => new Error(`Failed to insert version types. ${(error as Error).message}`),
      })
    );

    // @TODO: temporarily allow space metadata writing to fail gracefully. There is a space
    // written during testing that is breaking this flow. Once we start back from the correct
    // root space state this should be removed.
    yield* _(
      Effect.either(
        Effect.tryPromise({
          try: () => SpaceMetadata.upsert(spaceMetadata),
          catch: error => new Error(`Failed to insert space metadata. ${(error as Error).message}`),
        })
      )
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
    const typeVersionIds = new Set(
      (yield* _(Effect.promise(() => Versions.select({ entity_id: SYSTEM_IDS.TYPES })))).map(v => v.id)
    );

    for (const relation of relations) {
      const fromVersionId = relation.from_version_id.toString();
      const toVersionId = relation.to_version_id.toString();

      if (typeVersionIds.has(relation.type_of_id.toString())) {
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

function aggregateSpacesFromRelations(
  relations: Schema.relations.Insertable[],
  versions: Schema.versions.Insertable[],
  spaceIdByEditId: Map<string, string>
) {
  return Effect.gen(function* (_) {
    const spaces = new Map<string, string[]>();

    const [typesVersions, spaceConfigsVersions] = yield* _(
      Effect.all([
        Effect.promise(() => Versions.select({ entity_id: SYSTEM_IDS.TYPES })),
        Effect.promise(() => Versions.select({ entity_id: SYSTEM_IDS.SPACE_CONFIGURATION })),
      ])
    );

    const typeVersionIds = new Set(typesVersions.map(v => v.id.toString()));
    const spaceConfigVersionIds = new Set(spaceConfigsVersions.map(v => v.id.toString()));

    for (const relation of relations) {
      const fromVersionId = relation.from_version_id.toString();
      const toVersionId = relation.to_version_id.toString();

      if (typeVersionIds.has(relation.type_of_id.toString()) && spaceConfigVersionIds.has(toVersionId)) {
        const alreadyFoundSpaces = spaces.get(fromVersionId) ?? [];
        spaces.set(fromVersionId, [...alreadyFoundSpaces, toVersionId]);
      }
    }

    const entityIdByVersionId = new Map<string, string>();

    for (const version of versions) {
      entityIdByVersionId.set(version.id.toString(), version.entity_id.toString());
    }

    const versionIdToEditId = versions.reduce(
      (acc, v) => {
        acc.set(v.id.toString(), v.edit_id.toString());
        return acc;
      },
      // version id -> edit id
      new Map<string, string>()
    );

    const spaceVersions = [...versionIdToEditId.entries()].reduce(
      (acc, [versionId, editId]) => {
        acc.set(versionId, spaceIdByEditId.get(editId)!);
        return acc;
      },
      // version id -> space id
      new Map<string, string>()
    );

    return [...spaces.entries()].flatMap(([versionId, spaceIds]) => {
      const entityIdForVersionId = entityIdByVersionId.get(versionId);
      if (!entityIdForVersionId) {
        return [];
      }

      // I need the actual space id somewhere. Right now it's just two version ids
      return spaceIds
        .map(fromVersionId => {
          const spaceMetadata: Schema.spaces_metadata.Insertable = {
            space_id: spaceVersions.get(fromVersionId)!,
            entity_id: entityIdForVersionId,
          };

          return spaceMetadata;
        })
        .filter(m => m !== null);
    });
  });
}
