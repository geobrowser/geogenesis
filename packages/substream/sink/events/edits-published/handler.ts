import { SystemIds } from '@graphprotocol/grc-20';
import { Data, Effect } from 'effect';
import { dedupeWith } from 'effect/ReadonlyArray';
import type * as Schema from 'zapatos/schema';

import { mapIpfsProposalToSchemaProposalByType } from '../proposals-created/map-proposals';
import { CurrentVersions, Proposals, SpaceMetadata, Versions } from '~/sink/db';
import type { BlockEvent, DeleteTripleOp, SetTripleOp, SinkEditProposal } from '~/sink/types';
import { createVersionId } from '~/sink/utils/id';
import { retryEffect } from '~/sink/utils/retry-effect';
import { aggregateNewVersions } from '~/sink/write-edits/aggregate-versions';
import { mergeOpsWithPreviousVersions } from '~/sink/write-edits/merge-ops-with-previous-versions';
import { aggregateRelations } from '~/sink/write-edits/relations/aggregate-relations';
import { writeEdits } from '~/sink/write-edits/write-edits';

export class ProposalDoesNotExistError extends Error {
  readonly _tag = 'ProposalDoesNotExistError';
}

export class CouldNotWriteMergedVersionsError extends Error {
  readonly _tag = 'CouldNotWriteMergedVersionsError';
}

export class CouldNotWriteCurrentVersionsError extends Error {
  readonly _tag = 'CouldNotWriteCurrentVersionsError';
}

/**
 * Handles when the EditsPublished event is emitted by a space contract. When this
 * event is emitted depends on the governance mechanism that a space has configured
 * (voting vs no voting).
 */
export function handleEditsPublished(ipfsProposals: SinkEditProposal[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('[EDITS PUBLISHED] Started'));

    const {
      schemaEditProposals: { versions, relationOpsByEditId, tripleOpsByVersionId, edits },
    } = mapIpfsProposalToSchemaProposalByType(ipfsProposals, block);

    /**
     * @TODO
     * There is an edge case where there may be multiple versions created for an entity
     * across multiple spaces. Each version might have a different set of changes applied
     * to them in the edits. When both are accepted we need to merge the changes from each
     * version into a single version which has all of the changes across all of the spaces.
     *
     * Alternatively we only scope versions to one space at a time rather than having a
     * unified version across all spaces. This would mean that we never need to merge, but
     * clients would have to be aware of which version to query for.
     *
     * Currently this data service doesn't solve for this edge case, partly because block sizes
     * are very small on Arbitrum One, and partly because we haven't settled on the API spec
     * yet which would inform the right approach.
     */

    yield* _(
      Effect.fork(
        Effect.forEach(
          ipfsProposals,
          proposal =>
            Effect.tryPromise({
              try: () => Proposals.setAcceptedById(proposal.proposalId),
              catch: error => {
                console.error('Could not set proposal to accepted for proposal id', proposal.proposalId);
                return new ProposalDoesNotExistError(String(error));
              },
            }),
          {
            concurrency: 50,
          }
        )
      )
    );
    /**
     * If multiple proposals are created at different times, there's no guarantee that
     * they will be executed in the same order they were created except in cases of
     * early execution being triggered by the contract.
     *
     * This can result in states where a proposal that was created before another is
     * executed last. This would result in the first proposal's versions being the
     * current versions even though they aren't the most recently created, accepted
     * version.
     */

    // Currently we don't solve for above ordering issue.

    const nonstaleVersions = yield* _(
      aggregateNewVersions({
        block,
        edits: edits,
        ipfsVersions: versions,
        relationOpsByEditId,
        editType: 'DEFAULT',
      })
    );

    /**
     * Before writing new current versions we should check to see if the active current
     * version should be applied to the new version. This can happen if the new version
     * was created before the current version was created, but not executed until after
     * the current version was executed. When this happens neither of the versions
     * have data from each other.
     *
     * If we encounter versions where the current version is not the new version and
     * the current version block > new version block then we should run writeEdits
     * again on the new version and set the result as the current version.
     *
     * We should only replace the versions where the above condition applies. We
     * can just set the current version as normal for versions where it doesn't apply.
     * This behavior is necessary due to the way the versioning model works. Versions
     * are created with the entire state of the entity _at the time the version is
     * created_.
     */
    const findStaleCurrentVersions = Effect.forEach(
      nonstaleVersions,
      version =>
        Effect.promise(async () => {
          const [maybeCurrentVersion, editVersion] = await Promise.all([
            CurrentVersions.selectOne({ entity_id: version.entity_id }),

            // Query the DB representation since the mapped version doesn't have the
            // real created at block
            Versions.selectOne({ id: version.id }),
          ]);

          if (!maybeCurrentVersion || !maybeCurrentVersion.version || !editVersion) {
            return null;
          }

          if (maybeCurrentVersion.version.created_at_block > editVersion.created_at_block) {
            const newVersionId = createVersionId({
              entityId: version.id.toString(),
              proposalId: version.edit_id.toString(),
            });

            const newVersion = {
              // We create a new version derived from the old version. This new version
              // will go through the writeEdits processing to create a new version with
              // data from the current version and the new version.
              newVersion: {
                ...version,
                created_at_block: editVersion.created_at_block,
                id: newVersionId,
              },
              versionIdFromEdit: version.id.toString(),
              editId: version.edit_id.toString(),
            };

            return newVersion;
          }

          return null;
        }),
      {
        concurrency: 25,
      }
    );

    const freshVersionsForStaleCurrentVersions = (yield* _(findStaleCurrentVersions)).filter(v => v !== null);

    const tripleOpsForNewVersions = freshVersionsForStaleCurrentVersions.reduce((acc, nv) => {
      const ops = tripleOpsByVersionId.get(nv.versionIdFromEdit);

      if (ops) {
        acc.set(nv.newVersion.id, ops);
      }

      return acc;
    }, new Map<string, (SetTripleOp | DeleteTripleOp)[]>());

    const newVersions = freshVersionsForStaleCurrentVersions.map(v => v.newVersion);

    const opsByNewVersions = yield* _(
      mergeOpsWithPreviousVersions({
        edits: edits,
        tripleOpsByVersionId: tripleOpsForNewVersions,
        versions: newVersions,
      })
    );

    if (newVersions.length > 0) {
      yield* _(
        writeEdits({
          versions: newVersions,
          block,
          editType: 'DEFAULT',
          edits,
          tripleOpsByVersionId: opsByNewVersions,
          relationOpsByEditId,
        })
      );
    }

    const allNonstaleVersions = [...nonstaleVersions, ...newVersions].reduce((acc, v) => {
      acc.set(v.entity_id.toString(), v);
      return acc;
    }, new Map<string, Schema.versions.Insertable>());

    yield* _(
      Effect.tryPromise({
        try: () =>
          CurrentVersions.upsert(
            [...allNonstaleVersions.values()].map(v => {
              return {
                entity_id: v.entity_id,
                version_id: v.id,
              };
            }),
            {
              chunked: true,
            }
          ),
        catch: error => {
          console.error(`Failed to insert current versions. ${(error as Error).message}`);
          return new CouldNotWriteCurrentVersionsError(
            `Failed to insert current versions. ${(error as Error).message}`
          );
        },
      })
    );

    const relations = yield* _(
      aggregateRelations({
        relationOpsByEditId,
        versions: [...allNonstaleVersions.values()],
        edits,
        editType: 'DEFAULT',
      })
    );

    const spaceMetadatum = aggregateSpacesFromRelations(relations);

    yield* _(
      Effect.tryPromise({
        try: () =>
          SpaceMetadata.upsert(
            dedupeWith(spaceMetadatum, (a, z) => a.space_id === z.space_id),
            { chunked: true }
          ),
        catch: error =>
          new CouldNotWriteSpaceMetadataError({
            message: `Failed to insert space metadata. ${(error as Error).message}`,
          }),
      })
    );

    yield* _(Effect.logInfo('[EDITS PUBLISHED] Ended'));
  });
}

class CouldNotWriteSpaceMetadataError extends Data.TaggedError('CouldNotWriteSpaceMetadataError')<{
  message: string;
}> {}

function aggregateSpacesFromRelations(relations: Schema.relations.Insertable[]) {
  const spaceMetadatas: Schema.spaces_metadata.Insertable[] = [];

  for (const relation of relations) {
    const typeId = relation.type_of_id.toString();
    const toEntityId = relation.to_entity_id.toString();

    if (typeId === SystemIds.TYPES_ATTRIBUTE && toEntityId === SystemIds.SPACE_TYPE) {
      spaceMetadatas.push({
        space_id: relation.space_id,
        version_id: relation.from_version_id.toString(),
      });
    }
  }

  return spaceMetadatas;
}
