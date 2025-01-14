import { Data, Effect } from 'effect';
import { dedupeWith } from 'effect/ReadonlyArray';

import { mapIpfsProposalToSchemaProposalByType } from '../proposals-created/map-proposals';
import { CurrentVersions, Proposals, SpaceMetadata } from '~/sink/db';
import type { BlockEvent, SinkEditProposal } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';
import { aggregateNewVersions } from '~/sink/write-edits/aggregate-versions';
import { aggregateRelations } from '~/sink/write-edits/relations/aggregate-relations';
import { aggregateSpacesFromRelations } from '~/sink/write-edits/write-edits';

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
export function handleEditsPublished(ipfsProposals: SinkEditProposal[], createdSpaceIds: string[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('Handling approved edits'));

    const {
      schemaEditProposals: { versions, relationOpsByEditId, edits },
    } = mapIpfsProposalToSchemaProposalByType(ipfsProposals, block);

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
      Effect.forEach(
        ipfsProposals,
        proposal =>
          retryEffect(
            Effect.tryPromise({
              try: () => Proposals.setAcceptedById(proposal.proposalId),
              catch: error => {
                console.error('Could not set proposal to accepted for proposal id', proposal.proposalId);
                return new ProposalDoesNotExistError(String(error));
              },
            })
          ),
        {
          concurrency: 50,
        }
      )
    );

    yield* _(
      Effect.tryPromise({
        try: () =>
          CurrentVersions.upsert(
            nonstaleVersions.map(v => {
              return {
                entity_id: v.entity_id,
                version_id: v.id,
              };
            })
          ),
        catch: error => {
          console.error(`Failed to insert current versions. ${(error as Error).message}`);
          return new CouldNotWriteCurrentVersionsError(
            `Failed to insert current versions. ${(error as Error).message}`
          );
        },
      }),
      retryEffect
    );

    const relations = yield* _(
      aggregateRelations({
        relationOpsByEditId,
        versions: nonstaleVersions,
        edits,
        editType: 'DEFAULT',
      })
    );

    const spaceMetadatum = yield* _(aggregateSpacesFromRelations(relations));

    yield* _(
      Effect.tryPromise({
        try: () => SpaceMetadata.upsert(dedupeWith(spaceMetadatum, (a, z) => a.space_id === z.space_id)),
        catch: error =>
          new CouldNotWriteSpaceMetadataError({
            message: `Failed to insert space metadata. ${(error as Error).message}`,
          }),
      })
    );

    yield* _(Effect.logInfo('Approved edits created'));
  });
}

class CouldNotWriteSpaceMetadataError extends Data.TaggedError('CouldNotWriteSpaceMetadataError')<{
  message: string;
}> {}
