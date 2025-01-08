import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Data, Effect } from 'effect';
import { dedupeWith } from 'effect/ReadonlyArray';
import type * as Schema from 'zapatos/schema';

import { CurrentVersions, Entities, SpaceMetadata, Types, VersionSpaces, Versions } from '../db';
import { Relations } from '../db/relations';
import type { BlockEvent, CreateRelationOp, DeleteRelationOp, DeleteTripleOp, SetTripleOp } from '../types';
import { type OpWithCreatedBy, type SchemaTripleEdit, mapSchemaTriples } from './map-triples';
import { aggregateRelations } from './relations/aggregate-relations';
import { writeTriples } from './write-triples';

class CouldNotWriteVersionsError extends Data.TaggedError('CouldNotWriteVersionsError')<{ message: string }> {}
class CouldNotWriteEntitiesError extends Data.TaggedError('CouldNotWriteEntitiesError')<{ message: string }> {}
class CouldNotWriteRelationsError extends Data.TaggedError('CouldNotWriteRelationsError')<{ message: string }> {}
class CouldNotWriteVersionTypesError extends Data.TaggedError('CouldNotWriteVersionTypesError')<{ message: string }> {}
class CouldNotWriteSpaceMetadataError extends Data.TaggedError('CouldNotWriteSpaceMetadataError')<{
  message: string;
}> {}
class CouldNotWriteVersionSpacesError extends Data.TaggedError('CouldNotWriteVersionSpacesError')<{
  message: string;
}> {}

interface PopulateContentArgs {
  block: BlockEvent;
  versions: Schema.versions.Insertable[];
  relationOpsByEditId: Map<string, (CreateRelationOp | DeleteRelationOp)[]>;
  tripleOpsByVersionId: Map<string, (SetTripleOp | DeleteTripleOp)[]>;
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
  isAccepted?: boolean;
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
  const { versions, tripleOpsByVersionId, relationOpsByEditId, edits, block, editType, isAccepted } = args;

  const spaceIdByEditId = new Map<string, string>();
  for (const edit of edits) {
    spaceIdByEditId.set(edit.id.toString(), edit.space_id.toString());
  }

  const entities: Schema.entities.Insertable[] = [];
  const triplesWithCreatedBy: OpWithCreatedBy[] = [];
  const versionsWithMetadata: Schema.versions.Insertable[] = [];
  const versionSpaces: Schema.version_spaces.Insertable[] = [];

  const versionsByEdit = new Map<string, Schema.versions.Insertable[]>();
  for (const version of versions) {
    const editId = version.edit_id.toString();
    const versionsForEdit = versionsByEdit.get(editId) ?? [];
    versionsByEdit.set(editId, [...versionsForEdit, version]);
  }

  return Effect.gen(function* (_) {
    // Aggregate all of the attribute versions for each edit
    const attributeVersionsByEdit = yield* _(
      aggregateAttributeVersions({
        edits,
        versionsByEdit,
        tripleOpsByVersionId,
        editType,
      })
    );

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
        ops: tripleOpsByVersionId.get(version.id.toString()) ?? [],
      };

      const maybeAttributeVersions = attributeVersionsByEdit.get(version.edit_id.toString());

      if (!maybeAttributeVersions) {
        console.error(`No attribute versions for edit ${version.edit_id}`);
        continue;
      }

      const triplesForVersion = mapSchemaTriples(editWithCreatedById, maybeAttributeVersions, block);
      triplesWithCreatedBy.push(...triplesForVersion);

      const setTriples = triplesForVersion.filter(t => t.op === 'SET_TRIPLE');
      const nameTriple = setTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.NAME_ATTRIBUTE);

      const descriptionTriple = setTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.DESCRIPTION_ATTRIBUTE);

      const name = nameTriple?.triple.text_value?.toString();
      const description = descriptionTriple?.triple.text_value?.toString();

      versionsWithMetadata.push({
        ...version,
        name,
        description,
      } satisfies Schema.versions.Insertable);

      // Later we dedupe after applying space versions derived from relations
      for (const triple of triplesForVersion) {
        versionSpaces.push({
          version_id: triple.triple.version_id,
          space_id: triple.triple.space_id,
        });
      }
    }

    const uniqueEntities = dedupeWith(entities, (a, b) => a.id.toString() === b.id.toString());

    const relations = yield* _(
      aggregateRelations({
        relationOpsByEditId,
        versions,
        edits,
        editType,
      })
    );

    for (const relation of relations) {
      versionSpaces.push({
        version_id: relation.from_version_id,
        space_id: relation.space_id,
      });
    }

    const versionSpacesUnique = dedupeWith(
      versionSpaces,
      (a, z) => a.space_id.toString() !== z.space_id.toString() && a.version_id.toString() !== z.version_id.toString()
    );

    yield* _(
      Effect.all(
        [
          Effect.tryPromise({
            try: () => Versions.upsertMetadata(versionsWithMetadata),
            catch: error =>
              new CouldNotWriteVersionsError({
                message: `Failed to insert versions with metadata. ${(error as Error).message}`,
              }),
          }),
          Effect.tryPromise({
            // We update the name and description for an entity when mapping
            // through triples.
            try: () => Entities.upsert(uniqueEntities),
            catch: error =>
              new CouldNotWriteEntitiesError({ message: `Failed to insert entities. ${(error as Error).message}` }),
          }),
          Effect.tryPromise({
            try: () => VersionSpaces.upsert(versionSpacesUnique),
            catch: error =>
              new CouldNotWriteVersionSpacesError({
                message: `Failed to insert version spaces. ${(error as Error).message}`,
              }),
          }),
          writeTriples({
            schemaTriples: triplesWithCreatedBy,
          }),
          Effect.tryPromise({
            try: () => Relations.upsert(relations, { chunked: true }),
            catch: error =>
              new CouldNotWriteRelationsError({ message: `Failed to insert relations. ${(error as Error).message}` }),
          }),
        ],
        { concurrency: 'unbounded' }
      )
    );

    // We run this after versions are written so that we can fetch all of the types for the
    // type entity and compare them against the type_of_id version for each relatons to see
    // of the type_of_id is for the type entity.
    const versionTypes = yield* _(aggregateTypesFromRelationsAndTriples(relations));

    yield* _(
      Effect.tryPromise({
        try: () => Types.upsert(versionTypes),
        catch: error =>
          new CouldNotWriteVersionTypesError({
            message: `Failed to insert version types. ${(error as Error).message}`,
          }),
      })
    );

    if (isAccepted) {
      const spaceMetadata = yield* _(aggregateSpacesFromRelations(relations, versions, spaceIdByEditId));

      yield* _(
        Effect.tryPromise({
          try: () => SpaceMetadata.upsert(spaceMetadata),
          catch: error =>
            new CouldNotWriteSpaceMetadataError({
              message: `Failed to insert space metadata. ${(error as Error).message}`,
            }),
        })
      );
    }
  });
}

function aggregateTypesFromRelationsAndTriples(relations: Schema.relations.Insertable[]) {
  return Effect.gen(function* (_) {
    // entity version id -> type version ids
    const types = new Map<string, string[]>();
    const typeVersionIds = new Set(
      (yield* _(Effect.promise(() => Versions.select({ entity_id: SYSTEM_IDS.TYPES_ATTRIBUTE })))).map(v => v.id)
    );

    for (const relation of relations) {
      const fromVersionId = relation.from_version_id.toString();
      const toVersionId = relation.to_version_id.toString();

      if (typeVersionIds.has(relation.type_of_id.toString())) {
        const alreadyFoundTypes = types.get(fromVersionId) ?? [];
        types.set(fromVersionId, [...alreadyFoundTypes, toVersionId]);
      }
    }

    for (const relation of relations) {
      const versionId = relation.type_of_id.toString();
      const alreadyFoundTypes = types.get(versionId) ?? [];
      types.set(versionId, [...alreadyFoundTypes, versionId]);
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
    // space entity id -> entityIds[]
    const spaceConfigEntityVersionIds = new Set<string>();

    const [typesVersions, spaceConfigsVersions] = yield* _(
      Effect.all(
        [
          Effect.promise(() => Versions.select({ entity_id: SYSTEM_IDS.TYPES_ATTRIBUTE })),
          Effect.promise(() => Versions.select({ entity_id: SYSTEM_IDS.SPACE_CONFIGURATION })),
        ],
        { concurrency: 2 }
      )
    );

    const typeVersionIds = new Set(typesVersions.map(v => v.id.toString()));
    const spaceConfigVersionIds = new Set(spaceConfigsVersions.map(v => v.id.toString()));

    for (const relation of relations) {
      const fromVersionId = relation.from_version_id.toString();
      const toVersionId = relation.to_version_id.toString();

      if (typeVersionIds.has(relation.type_of_id.toString()) && spaceConfigVersionIds.has(toVersionId)) {
        spaceConfigEntityVersionIds.add(fromVersionId);
      }
    }

    // Map space config entity versions to their entity ids
    // Map all space config entity version ids from this block to their entity ids and space ids
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

    return [...spaceConfigEntityVersionIds.values()]
      .map(spaceConfigEntityVersionId => {
        const spaceMetadata: Schema.spaces_metadata.Insertable = {
          space_id: spaceVersions.get(spaceConfigEntityVersionId)!,
          version_id: spaceConfigEntityVersionId,
        };

        return spaceMetadata;
      })
      .filter(m => m !== null);
  });
}

type AggregateAttributeVersionsArgs = {
  tripleOpsByVersionId: Map<string, (SetTripleOp | DeleteTripleOp)[]>;
  versionsByEdit: Map<string, Schema.versions.Insertable[]>;
  edits: Schema.edits.Insertable[];
  editType: 'IMPORT' | 'DEFAULT';
};

type AttributeVersionIdsByEditId = Map<string, Map<string, string>>;

/**
 * All data models in the knowledge graph which reference entities should also (or instead)
 * reference a specific version of that entity. This function takes all of the attribute ids
 * for each triple in the block and aggregates the latest version id for those attributes.
 * These attribute version ids are later written to the triples written in this block.
 *
 * By default we take the latest version of each attribute from the db (the current version).
 * If the attribute itself is being changed in an edit, we use the new version id from the edit
 * instead of the current version id.
 */
function aggregateAttributeVersions(args: AggregateAttributeVersionsArgs): Effect.Effect<AttributeVersionIdsByEditId> {
  const { tripleOpsByVersionId, versionsByEdit, edits, editType } = args;

  const attributeEntityIds = [...tripleOpsByVersionId.values()].flatMap(ops => ops.map(o => o.triple.attribute));
  const uniqueAttributeEntityIds = dedupeWith(attributeEntityIds, (a, b) => a === b);

  return Effect.gen(function* (_) {
    const maybeCurrentVersionForAttributeIds = (yield* _(
      Effect.forEach(
        uniqueAttributeEntityIds,
        entityId => Effect.promise(() => CurrentVersions.selectOne({ entity_id: entityId })),
        { concurrency: 15 }
      )
    )).filter(v => !!v);

    const currentVersionByEntityId = new Map<string, string>();
    for (const version of maybeCurrentVersionForAttributeIds) {
      currentVersionByEntityId.set(version.entity_id.toString(), version.version_id.toString());
    }

    const attributeVersionIdsByEditId = new Map<string, Map<string, string>>();

    for (const edit of edits) {
      const editId = edit.id.toString();
      const versionsInEdit = versionsByEdit.get(editId) ?? [];
      const attributeVersionsInEditByEntityId = new Map<string, string>();

      // If we're reading a set of imported edits we want to use all of the versions
      // from the set and not just the versions from the current edit. This is because
      // an edit in an import might reference an edit in the import that hasn't been
      // "accepted" yet. We should treat these edits as if they are a single atomic
      // unit that will eventually be accepted.
      const versions = editType === 'IMPORT' ? [...versionsByEdit.values()].flat() : versionsInEdit;

      // Merge the versions from this block for this edit with any versions for this entity
      // from the database. We favor any versions from the block over the versions in the
      // database.
      const allReferencedAttributeVersions = [
        ...maybeCurrentVersionForAttributeIds.map(cv => {
          return {
            id: cv.version_id,
            entity_id: cv.entity_id,
          };
        }),

        ...versions,
      ];

      for (const version of allReferencedAttributeVersions) {
        attributeVersionsInEditByEntityId.set(version.entity_id.toString(), version.id.toString());
      }

      attributeVersionIdsByEditId.set(editId, attributeVersionsInEditByEntityId);
    }

    return attributeVersionIdsByEditId;
  });
}
