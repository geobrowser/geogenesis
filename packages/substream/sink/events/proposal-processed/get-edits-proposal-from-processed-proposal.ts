import { ActionType, Import, IpfsMetadata } from '@geogenesis/sdk/proto';
import { Effect, Either } from 'effect';

import { Spaces } from '../../db';
import { getFetchIpfsContentEffect } from '../../ipfs';
import type { GeoBlock, Op } from '../../types';
import { getChecksumAddress } from '../../utils/get-checksum-address';
import { slog } from '../../utils/slog';
import { type EditProposal, type ProposalProcessed } from '../proposals-created/parser';
import { Decoder, decode } from '~/sink/proto';

class InvalidProcessedProposalContentTypeError extends Error {
  _tag: 'InvalidProcessedProposalContentTypeError' = 'InvalidProcessedProposalContentTypeError';
}

function fetchEditProposalFromIpfs(
  processedProposal: {
    ipfsUri: string;
    pluginAddress: string;
  },
  block: GeoBlock
) {
  return Effect.gen(function* (_) {
    const maybeSpaceIdForVotingPlugin = yield* _(
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
    const maybeIpfsContent = yield* _(Effect.either(fetchIpfsContentEffect));

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

    const validIpfsMetadata = yield* _(decode(() => IpfsMetadata.fromBinary(ipfsContent)));

    if (!validIpfsMetadata) {
      // @TODO: Effectify error handling
      console.error('Failed to parse IPFS metadata', validIpfsMetadata);
      return null;
    }

    switch (validIpfsMetadata.type) {
      case ActionType.ADD_EDIT: {
        const parsedContent = yield* _(Decoder.decodeEdit(ipfsContent));

        if (!parsedContent) {
          return null;
        }

        const contentProposal: EditProposal = {
          type: 'ADD_EDIT',
          name: validIpfsMetadata.name ?? null,
          proposalId: parsedContent.id,
          onchainProposalId: '-1',
          pluginAddress: getChecksumAddress(processedProposal.pluginAddress),
          ops: parsedContent.ops as Op[],
          // @TODO: We can use the createdBy on the ImportEdit type instead of
          // hard-coding Geo as the creator.
          creator: getChecksumAddress('0x66703c058795B9Cb215fbcc7c6b07aee7D216F24'),
          space: maybeSpaceIdForVotingPlugin.id,
          endTime: block.timestamp.toString(),
          startTime: block.timestamp.toString(),
          metadataUri: processedProposal.ipfsUri,
        };

        return contentProposal;
      }
      // The initial content set might not be an Edit and instead be an import. If it's an import
      // we need to turn every Edit in the import into an individual EditProposal.
      case ActionType.IMPORT_SPACE:
        const importResult = yield* _(decode(() => Import.fromBinary(ipfsContent)));

        if (!importResult) {
          return null;
        }

        const decodeImportEditEffect = (hash: string) => {
          return Effect.gen(function* (_) {
            const ipfsContent = yield* _(getFetchIpfsContentEffect(hash));
            if (!ipfsContent) return null;

            const validIpfsMetadata = yield* _(decode(() => IpfsMetadata.fromBinary(ipfsContent)));
            if (!validIpfsMetadata) return null;

            return yield* _(Decoder.decodeImportEdit(ipfsContent));
          });
        };

        const maybeDecodedEdits = yield* _(
          Effect.all(importResult.edits.map(decodeImportEditEffect), {
            concurrency: 50,
            // @TODO: Batching, filtering errors? retrying errors?
          })
        );

        const decodedEdits = maybeDecodedEdits.flatMap(e => (e ? [e] : []));

        const proposals = decodedEdits.map(e => {
          if (e.blockNumber === '') {
            console.log('invalid block number for edit', { number: e.blockNumber, editId: e.id });
          }

          const contentProposal: EditProposal = {
            type: 'ADD_EDIT',
            name: e.name ?? null,
            proposalId: e.id,
            onchainProposalId: '-1',
            pluginAddress: getChecksumAddress(processedProposal.pluginAddress),
            ops: e.ops as Op[],
            creator: e.createdBy,
            space: maybeSpaceIdForVotingPlugin.id,
            endTime: block.timestamp.toString(),
            startTime: block.timestamp.toString(),
            metadataUri: processedProposal.ipfsUri,
            createdAtBlock: {
              blockNumber: e.blockNumber,
              cursor: '',
              hash: e.blockHash,
              network: importResult.previousNetwork,
              requestId: '-1',
              timestamp: e.createdAt,
            },
          };

          return contentProposal;
        });

        return proposals;
    }

    yield* _(
      Effect.fail(
        new InvalidProcessedProposalContentTypeError(
          `Invalid processed proposal content type ${validIpfsMetadata.type}`
        )
      )
    );

    return null;
  });
}

export function getProposalFromInitialSpaceProposalIpfsUri(proposalsProcessed: ProposalProcessed[], block: GeoBlock) {
  return Effect.gen(function* (_) {
    slog({
      requestId: block.requestId,
      message: `Gathering IPFS content for ${proposalsProcessed.length} initial space proposals`,
    });

    const maybeProposalsFromIpfs = yield* _(
      Effect.all(
        proposalsProcessed.map(proposal =>
          fetchEditProposalFromIpfs(
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

    const proposalsFromIpfs = maybeProposalsFromIpfs.flatMap(e => (e ? [e] : [])).flat();
    return proposalsFromIpfs;
  });
}
