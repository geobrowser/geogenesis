import { Effect, Either } from 'effect';

import { Spaces } from '../../db';
import type { SpaceWithPluginAddressNotFoundError } from '../../errors';
import type { BlockEvent } from '../../types';
import { isValidAction } from '../../utils/actions';
import { getChecksumAddress } from '../../utils/get-checksum-address';
import { getFetchIpfsContentEffect } from '../../utils/ipfs';
import { slog } from '../../utils/slog';
import {
  type ContentProposal,
  type ProposalProcessed,
  ZodContentProposal,
  ZodProposalMetadata,
} from '../proposals-created/parser';

class InvalidProcessedProposalContentTypeError extends Error {
  _tag: 'InvalidProcessedProposalContentTypeError' = 'InvalidProcessedProposalContentTypeError';
}

function fetchContentProposalFromIpfs(
  processedProposal: {
    ipfsUri: string;
    pluginAddress: string;
  },
  block: BlockEvent
): Effect.Effect<
  ContentProposal | null,
  SpaceWithPluginAddressNotFoundError | InvalidProcessedProposalContentTypeError
> {
  return Effect.gen(function* (unwrap) {
    const maybeSpaceIdForVotingPlugin = yield* unwrap(
      Effect.promise(() => Spaces.findForSpacePlugin(processedProposal.pluginAddress))
    );

    if (!maybeSpaceIdForVotingPlugin) {
      slog({
        message: `Matching space in Proposal not found for plugin address ${processedProposal.pluginAddress}`,
        requestId: block.requestId,
      });

      return null;
    }

    slog({
      message: `Fetching IPFS content for processed proposal
        ipfsUri:       ${processedProposal.ipfsUri}
        pluginAddress: ${processedProposal.pluginAddress}`,
      requestId: block.requestId,
    });

    const fetchIpfsContentEffect = getFetchIpfsContentEffect(processedProposal.ipfsUri);
    const maybeIpfsContent = yield* unwrap(Effect.either(fetchIpfsContentEffect));

    if (Either.isLeft(maybeIpfsContent)) {
      const error = maybeIpfsContent.left;

      switch (error._tag) {
        case 'UnableToParseBase64Error':
          console.error(`Unable to parse base64 string ${processedProposal.ipfsUri}`, error);
          break;
        case 'FailedFetchingIpfsContentError':
          console.error(`Failed fetching IPFS content from uri ${processedProposal.ipfsUri}`, error);
          break;
        case 'UnableToParseJsonError':
          console.error(`Unable to parse JSON when reading content from uri ${processedProposal.ipfsUri}`, error);
          break;
        case 'TimeoutException':
          console.error(`Timed out when fetching IPFS content for uri ${processedProposal.ipfsUri}`, error);
          break;
        default:
          console.error(`Unknown error when fetching IPFS content for uri ${processedProposal.ipfsUri}`, error);
          break;
      }

      return null;
    }

    const ipfsContent = maybeIpfsContent.right;

    if (!ipfsContent) {
      return null;
    }

    const validIpfsMetadata = ZodProposalMetadata.safeParse(ipfsContent);

    if (!validIpfsMetadata.success) {
      // @TODO: Effectify error handling
      console.error('Failed to parse IPFS metadata', validIpfsMetadata.error);
      return null;
    }

    switch (validIpfsMetadata.data.type) {
      case 'CONTENT':
        const parsedContent = ZodContentProposal.safeParse(ipfsContent);

        if (!parsedContent.success) {
          return null;
        }

        const contentProposal: ContentProposal = {
          type: validIpfsMetadata.data.type,
          name: validIpfsMetadata.data.name ?? null,
          proposalId: parsedContent.data.proposalId,
          onchainProposalId: '-1',
          actions: parsedContent.data.actions.filter(isValidAction),
          creator: getChecksumAddress('0x66703c058795B9Cb215fbcc7c6b07aee7D216F24'), // Geobot
          space: getChecksumAddress(maybeSpaceIdForVotingPlugin.id),
          endTime: block.timestamp.toString(),
          startTime: block.timestamp.toString(),
          metadataUri: processedProposal.ipfsUri,
        };

        return contentProposal;
    }

    yield* unwrap(
      Effect.fail(
        new InvalidProcessedProposalContentTypeError(
          `Invalid processed proposal content type ${validIpfsMetadata.data.type}`
        )
      )
    );

    return null;
  });
}

export function getContentProposalFromProcessedProposalIpfsUri(
  proposalsProcessed: ProposalProcessed[],
  block: BlockEvent
) {
  return Effect.gen(function* (_) {
    slog({
      requestId: block.requestId,
      message: `Gathering IPFS content for ${proposalsProcessed.length} initial space proposals`,
    });

    const maybeProposalsFromIpfs = yield* _(
      Effect.all(
        proposalsProcessed.map(proposal =>
          fetchContentProposalFromIpfs(
            {
              ipfsUri: proposal.contentUri,
              pluginAddress: proposal.pluginAddress,
            },
            block
          )
        ),
        {
          concurrency: 20,
        }
      )
    );

    const proposalsFromIpfs = maybeProposalsFromIpfs.filter(
      (maybeProposal): maybeProposal is ContentProposal => maybeProposal !== null
    );

    return proposalsFromIpfs;
  });
}
