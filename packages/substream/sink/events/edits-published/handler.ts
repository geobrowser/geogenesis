import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import { mapIpfsProposalToSchemaProposalByType } from '../proposals-created/map-proposals';
import type { EditProposal } from '../proposals-created/parser';
import { aggregateMergableOps, aggregateMergableVersions } from './aggregate-mergable-versions';
import { CurrentVersions, Proposals, Versions } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';
import { partition } from '~/sink/utils';
import { slog } from '~/sink/utils/slog';
import { writeEdits } from '~/sink/write-edits/write-edits';

export class ProposalDoesNotExistError extends Error {
  readonly _tag = 'ProposalDoesNotExistError';
}

/**
 * Handles when the EditsPublished event is emitted by a space contract. When this
 * event is emitted depends on the governance mechanism that a space has configured
 * (voting vs no voting).
 */
export function handleEditsPublished(ipfsProposals: EditProposal[], createdSpaceIds: string[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    slog({
      requestId: block.requestId,
      message: `Updating processed proposals to accepted`,
    });

    // See comment above function definition for more details as to why we do this.
    const { mergedOpsByVersionId, mergedVersions, edits, versions } = aggregateMergedVersions(ipfsProposals, block);

    /**
     * We treat imported edits and non-imported edits as separate units of work since
     * imports have separate requirements for how they handle merging data for versions.
     * See comment in {@link writeEdits} for more details.
     */
    const currentVersions = aggregateCurrentVersions(versions, mergedVersions);
    const [importedEdits, defaultEdits] = partition(edits, e => createdSpaceIds.includes(e.space_id.toString()));
    const [importedVersions, defaultVersions] = partition(mergedVersions, v =>
      importedEdits.some(e => e.id.toString() === v.edit_id.toString())
    );

    yield* _(
      Effect.all([
        Effect.tryPromise({
          try: () => Versions.upsert(mergedVersions),
          catch: error => new Error(`Failed to insert merged versions. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () => CurrentVersions.upsert(currentVersions),
          catch: error => new Error(`Failed to insert current versions. ${(error as Error).message}`),
        }),
        writeEdits({
          versions: defaultVersions,
          opsByVersionId: mergedOpsByVersionId,
          edits: defaultEdits,
          block,
          // @TODO: How do we handle imported edits? How do we know?
          editType: 'DEFAULT',
        }),
        ...ipfsProposals.map(proposal => {
          return Effect.tryPromise({
            try: () => Proposals.setAcceptedById(proposal.proposalId),
            catch: error => {
              return new ProposalDoesNotExistError(String(error));
            },
          });
        }),
      ])
    );

    /**
     * We treat imported edits and non-imported edits as separate units of work since
     * imports have separate requirements for how they handle merging data for versions.
     * See comment in {@link writeEdits} for more details.
     */
    yield* _(
      writeEdits({
        versions: importedVersions,
        opsByVersionId: mergedOpsByVersionId,
        block,
        edits: importedEdits,
        editType: 'IMPORT',
      })
    );

    slog({
      requestId: block.requestId,
      message: `${ipfsProposals.length} proposals set to accepted successfully`,
    });
  });
}

function aggregateCurrentVersions(
  versions: S.versions.Insertable[],
  mergedVersions: S.versions.Insertable[]
): S.current_versions.Insertable[] {
  // entityId -> versionId
  const currentVersions = new Map<string, string>();

  // Favor merged versions over versions
  for (const version of [...versions, ...mergedVersions]) {
    currentVersions.set(version.entity_id.toString(), version.id.toString());
  }

  return [...currentVersions.entries()].map(([entityId, versionId]): S.current_versions.Insertable => {
    return {
      entity_id: entityId,
      version_id: versionId,
    };
  });
}

/**
 * Merges versions from the same entity into a new version. If many versions change
 * the same entity in the same block we need to make sure that there exists a version
 * that contains all of the changes from each of the versions. If we don't, then we
 * end up in a situation where there are many valid versions for the same entity at one
 * time, and none of them contain all of the changes from the other versions.
 *
 * @NOTE that this only occurs in scenarios where many versions for the same entity are
 * approved/executed in the same block.
 *
 * There's a few ways to solve this issue:
 * 1. At query time we materialize all of the "valid" versions for an entity and merge
 *    them before returning to the caller. This is effectively duplicating the work in
 *    the API server that the indexer is already doing for versions.
 * 2. We can make a new version at indexing time to handle the aggregated versions. The
 *    downside of this approach is that we create more duplicated triples as well as
 *    rewrites history. This acts similarly to how "merge" commit works in git.
 * 3. We don't merge at all and rely on the clients to merge all concurrently valid versions.
 *    This won't work as each version wouldn't correctly handle possible deleted triples
 *    across versions unless we stored the triples as ops with their opType, which we
 *    don't currently do.
 *
 * This function implements #2. The implementation might change in the future as we get more
 * feedback on our versioning mechanisms.
 */
function aggregateMergedVersions(proposals: EditProposal[], block: BlockEvent) {
  // @NOTE:
  // We still use the re-fetched data from IPFS since we need to re-apply all of the ops
  // from each of the merged versions into the new version.
  //
  // One approach we could attempt instead is to read the triples from the db (vs IPFS) for
  // each version and then write all of those to the new version. The problem with this approach
  // is that it doesn't account for deletions, so you can end up with a triple that was
  // deleted in one of the merged versions still existing on the merged version. Alternatively
  // we could store the ops in the db as well, but for now we'll just re-fetch from IPFS since
  // we already have that workflow in place.
  const {
    schemaEditProposals: { opsByVersionId, versions, edits },
  } = mapIpfsProposalToSchemaProposalByType(proposals, block);

  // Get the versions that have more than one version for the same entity id
  const manyVersionsByEntityId = aggregateMergableVersions(versions);

  // Merge the versions in this block with the same entity id into a new aggregated version
  // containing all the changes from each of the versions.
  const { mergedOpsByVersionId, mergedVersions } = aggregateMergableOps({
    manyVersionsByEntityId,
    opsByVersionId,
    block,
  });

  return {
    mergedVersions,
    mergedOpsByVersionId,
    edits,
    versions,
  };
}
