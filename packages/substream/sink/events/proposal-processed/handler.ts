import { createGeoId } from '@geogenesis/sdk';
import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import { mapIpfsProposalToSchemaProposalByType } from '../proposals-created/map-proposals';
import type { EditProposal } from '../proposals-created/parser';
import { aggregateMergableOps, aggregateMergableVersions } from './aggregate-mergable-versions';
import { Proposals, Versions } from '~/sink/db';
import { populateContent } from '~/sink/entries/populate-content';
import type { BlockEvent, Op } from '~/sink/types';
import { createVersionId } from '~/sink/utils/id';
import { slog } from '~/sink/utils/slog';

export class ProposalDoesNotExistError extends Error {
  readonly _tag = 'ProposalDoesNotExistError';
}

export function handleProposalsProcessed(ipfsProposals: EditProposal[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    slog({
      requestId: block.requestId,
      message: `Updating processed proposals to accepted`,
    });

    const dbProposals = yield* _(
      Effect.all(
        ipfsProposals.map(proposal => {
          return Effect.tryPromise({
            try: () => Proposals.setAcceptedById(proposal.proposalId),
            catch: error => {
              return new ProposalDoesNotExistError(String(error));
            },
          });
        }),
        {
          concurrency: 75,
          mode: 'either',
        }
      )
    );

    slog({
      requestId: block.requestId,
      message: `${dbProposals.length} proposals set to accepted successfully`,
    });

    // See comment above function definition for more details as to why we do this.
    yield* _(commitMergedVersions(ipfsProposals, block));
    // commitMergedRelations
    // commitMergedEntityTypes
    // commitMergedEntitySpaces

    // @TODO: Write relations in populateTriples or populateContent
    // 1. Aggregate all exsting relations for every version in the set of proposals in
    //    the block
    // 2. If there are any changes, e.g., to fractional index, then write those changes along
    //    with duplicated relations to the db that map to the new version id. Make sure to check
    //    if any of the duplicated relations should be deleted in the new version.
    // 3. Aggregate any _new_ relations for the new version and write those to the db.
  });
}

/**
 * Merges versions from the same entity into a new version. If many versions change
 * the same entity in the same block we need to make sure that there exists a version
 * that contains all of the changes from each of the versions. If we don't, then we
 * end up in a situation where there are many valid versions for the same entity at one
 * time, and none of them contain all of the changes from the other versions.
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
function commitMergedVersions(proposals: EditProposal[], block: BlockEvent) {
  return Effect.gen(function* (_) {
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

    yield* _(
      Effect.tryPromise({
        try: () => Versions.upsert(mergedVersions),
        catch: error => new Error(`Failed to insert merged versions. ${(error as Error).message}`),
      })
    );

    yield* _(
      populateContent({
        versions: mergedVersions,
        opsByVersionId: mergedOpsByVersionId,
        edits,
        block,
        isMerging: true,
      })
    );
  });
}
