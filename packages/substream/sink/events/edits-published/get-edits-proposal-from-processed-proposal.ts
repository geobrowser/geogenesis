import { getChecksumAddress } from '@graphprotocol/grc-20';
import { Effect, Either } from 'effect';

import { Spaces } from '../../db';
import { getFetchIpfsContentEffect } from '../../ipfs';
import type { BlockEvent, IntermediateSinkEditProposal } from '../../types';
import { postProcessProposalOps } from '../post-process-edit-proposals';
import type { ChainEditPublished } from '../schema/edit-published';
import { Decoder } from '~/sink/proto';

function fetchEditProposalFromIpfs(processedProposal: ChainEditPublished, block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logDebug(`[FETCH EDIT PROPOSALS] Verifying plugin address ${processedProposal.pluginAddress}`));

    const maybeSpaceIdForSpacePlugin = yield* _(
      Effect.promise(() => Spaces.findForSpacePlugin(processedProposal.pluginAddress))
    );

    if (!maybeSpaceIdForSpacePlugin) {
      yield* _(
        Effect.logError(`Matching space in Proposal not found for plugin address ${processedProposal.pluginAddress}`)
      );

      return null;
    }

    yield* _(Effect.logDebug(`[FETCH EDIT PROPOSALS] Fetching IPFS content ${processedProposal.contentUri}`));

    const fetchIpfsContentEffect = getFetchIpfsContentEffect(processedProposal.contentUri);
    const maybeIpfsContent = yield* _(Effect.either(fetchIpfsContentEffect));

    if (Either.isLeft(maybeIpfsContent)) {
      const error = maybeIpfsContent.left;

      switch (error._tag) {
        case 'UnableToParseBase64Error':
          yield* _(
            Effect.logError(
              `[FETCH EDIT PROPOSALS] Unable to parse base64 string ${processedProposal.contentUri}. ${String(error)}`
            )
          );
          break;
        case 'FailedFetchingIpfsContentError':
          yield* _(
            Effect.logError(
              `[FETCH EDIT PROPOSALS] Failed fetching IPFS content from uri ${processedProposal.contentUri}. ${String(
                error
              )}`
            )
          );
          break;
        case 'UnableToParseJsonError':
          yield* _(
            Effect.logError(
              `[FETCH EDIT PROPOSALS] Unable to parse JSON when reading content from uri ${
                processedProposal.contentUri
              }. ${String(error)}`
            )
          );
          break;
        case 'TimeoutException':
          yield* _(
            Effect.logError(
              `[FETCH EDIT PROPOSALS] Timed out when fetching IPFS content for uri ${
                processedProposal.contentUri
              }. ${String(error)}`
            )
          );
          break;
        default:
          yield* _(
            Effect.logError(
              `[FETCH EDIT PROPOSALS] Unknown error when fetching IPFS content for uri ${
                processedProposal.contentUri
              }. ${String(error)}`
            )
          );
          break;
      }

      return null;
    }

    const ipfsContent = maybeIpfsContent.right;

    if (!ipfsContent) {
      yield* _(
        Effect.logError(
          `[FETCH EDIT PROPOSALS] Failed to fetch IPFS content for proposal in dao ${processedProposal.daoAddress} with content hash ${processedProposal.contentUri}`
        )
      );

      return null;
    }

    const validIpfsMetadata = yield* _(Decoder.decodeIpfsMetadata(ipfsContent));

    if (!validIpfsMetadata) {
      // @TODO: Effectify error handling
      yield* _(Effect.logError(`[FETCH EDIT PROPOSALS] Failed to parse IPFS metadata ${validIpfsMetadata}`));
      return null;
    }

    switch (validIpfsMetadata.type) {
      case 'ADD_EDIT': {
        const parsedContent = yield* _(Decoder.decodeEdit(ipfsContent));

        if (!parsedContent) {
          yield* _(
            Effect.logError(
              `[FETCH EDIT PROPOSALS] Failed to parse edit content for proposal in dao ${processedProposal.daoAddress} with content hash ${processedProposal.contentUri} metadata: ${validIpfsMetadata}`
            )
          );
          return null;
        }

        const contentProposal: IntermediateSinkEditProposal = {
          type: 'ADD_EDIT',
          name: parsedContent.name ?? null,
          proposalId: parsedContent.id,
          onchainProposalId: '-1',
          daoAddress: processedProposal.daoAddress,
          pluginAddress: getChecksumAddress(processedProposal.pluginAddress),
          ops: parsedContent.ops,
          // @TODO: For non-import edits there's currently no event that includes the createdById
          // for the caller. For public spaces we read it from the event that created the proposal,
          // but for actions that don't have a proposal we don't know who triggered the action, or
          // if the person who triggered the action is the person who actually wrote the content.
          creator: parsedContent.authors[0] ? getChecksumAddress(parsedContent.authors[0]) : '',
          space: maybeSpaceIdForSpacePlugin.id,
          endTime: block.timestamp.toString(),
          startTime: block.timestamp.toString(),
          contentUri: processedProposal.contentUri,
        };

        return contentProposal;
      }
      // The initial content set might not be an Edit and instead be an import. If it's an import
      // we need to turn every Edit in the import into an individual EditProposal.
      case 'IMPORT_SPACE': {
        const importResult = yield* _(Decoder.decodeImport(ipfsContent));

        if (!importResult) {
          yield* _(
            Effect.logError(
              `[FETCH EDIT PROPOSALS] Failed to parse import content for proposal in dao ${processedProposal.daoAddress} with content hash ${processedProposal.contentUri} metadata: ${validIpfsMetadata}`
            )
          );
          return null;
        }

        const decodeImportEditEffect = (hash: string) => {
          return Effect.gen(function* (_) {
            const ipfsContent = yield* _(getFetchIpfsContentEffect(hash));
            if (!ipfsContent) return null;

            const validIpfsMetadata = yield* _(Decoder.decodeIpfsMetadata(ipfsContent));
            if (!validIpfsMetadata) return null;

            return yield* _(Decoder.decodeImportEdit(ipfsContent));
          });
        };

        const maybeDecodedEdits = yield* _(
          Effect.forEach(importResult.edits, decodeImportEditEffect, {
            concurrency: 50,
            // @TODO: Batching, filtering errors? retrying errors?
          })
        );

        const decodedEdits = maybeDecodedEdits.flatMap(e => (e ? [e] : []));

        const proposals = decodedEdits.map(e => {
          const contentProposal: IntermediateSinkEditProposal = {
            type: 'ADD_EDIT',
            daoAddress: getChecksumAddress(processedProposal.daoAddress),
            name: e.name ?? null,
            proposalId: e.id,
            onchainProposalId: '-1',
            pluginAddress: getChecksumAddress(processedProposal.pluginAddress),
            ops: e.ops,
            creator: getChecksumAddress(e.createdBy),
            space: maybeSpaceIdForSpacePlugin.id,
            endTime: block.timestamp.toString(),
            startTime: block.timestamp.toString(),
            contentUri: processedProposal.contentUri,
          };

          return contentProposal;
        });

        return proposals;
      }
    }
  });
}

export function getEditsProposalsFromIpfsUri(proposalsProcessed: ChainEditPublished[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('[FETCH EDIT PROPOSALS] Start'));

    const maybeProposalsFromIpfs = yield* _(
      Effect.forEach(proposalsProcessed, proposal => fetchEditProposalFromIpfs(proposal, block), {
        concurrency: 20,
      })
    );

    const proposalsFromIpfs = maybeProposalsFromIpfs.flatMap(e => (e ? [e] : [])).flat();

    // We post-process the proposal to map from the intermediate Zod representation of ops
    // to the fully-qualified representation of ops. The fully qualified representation may
    // require data fetching in the case of file imports. File imports might generate many
    // more ops as well.
    return proposalsFromIpfs.map(p => postProcessProposalOps(p, p.space));
  });
}
