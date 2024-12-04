import { getChecksumAddress } from '@geogenesis/sdk';
import { Effect, Either } from 'effect';

import { type EditProposal, type PublishEditProposalCreated } from './parser';
import { Spaces } from '~/sink/db';
import type { SpaceWithPluginAddressNotFoundError } from '~/sink/errors';
import { getFetchIpfsContentEffect } from '~/sink/ipfs';
import { Decoder } from '~/sink/proto';
import type { Op, SetTripleOp } from '~/sink/types';

/**
 * We don't know the content type of the proposal until we fetch the IPFS content and parse it.
 *
 * 1. Verify that the space exists for the plugin address
 * 2. Fetch the IPFS content
 * 3. Parse the IPFS content to get the "type"
 * 4. Return an object matching the type and the expected contents.
 *
 * Later on we map this to the database schema and write the proposal to the database.
 */
export function getProposalFromIpfs(
  proposal: PublishEditProposalCreated
): Effect.Effect<EditProposal | null, SpaceWithPluginAddressNotFoundError> {
  return Effect.gen(function* (_) {
    yield* _(Effect.logDebug('Fetching proposal from IPFS'));

    const maybeSpace = yield* _(Effect.promise(() => Spaces.getById(proposal.daoAddress)));

    if (!maybeSpace) {
      yield* _(Effect.logError(`Space not found for DAO address ${proposal.daoAddress}`));
      return null;
    }

    if (maybeSpace.main_voting_plugin_address !== proposal.pluginAddress) {
      yield* _(Effect.logError(`Proposal is not for the voting plugin`));
      return null;
    }

    yield* _(
      Effect.logDebug(`Fetching IPFS content for proposal
      proposalId:    ${proposal.proposalId}
      pluginAddress: ${proposal.pluginAddress}
      creator:       ${proposal.creator}
      contentUri:   ${proposal.contentUri}
      startTime:     ${proposal.startTime}
      endTime:       ${proposal.endTime}`)
    );

    const fetchIpfsContentEffect = getFetchIpfsContentEffect(proposal.contentUri);
    const maybeIpfsContent = yield* _(Effect.either(fetchIpfsContentEffect));

    if (Either.isLeft(maybeIpfsContent)) {
      const error = maybeIpfsContent.left;

      switch (error._tag) {
        case 'UnableToParseBase64Error':
          yield* _(Effect.logError(`Unable to parse base64 string ${proposal.contentUri}. ${String(error)}`));
          break;
        case 'FailedFetchingIpfsContentError':
          yield* _(Effect.logError(`Failed fetching IPFS content from uri ${proposal.contentUri}. ${String(error)}`));
          break;
        case 'UnableToParseJsonError':
          yield* _(
            Effect.logError(
              `Unable to parse JSON when reading content from uri ${proposal.contentUri}. ${String(error)}`
            )
          );
          break;
        case 'TimeoutException':
          yield* _(
            Effect.logError(`Timed out when fetching IPFS content for uri ${proposal.contentUri}. ${String(error)}`)
          );
          break;
        default:
          yield* _(
            Effect.logError(`Unknown error when fetching IPFS content for uri ${proposal.contentUri}. ${String(error)}`)
          );
          break;
      }

      return null;
    }

    const ipfsContent = maybeIpfsContent.right;

    if (!ipfsContent) {
      return null;
    }

    const validIpfsMetadata = yield* _(Decoder.decodeIpfsMetadata(ipfsContent));

    if (!validIpfsMetadata) {
      // @TODO: Effectify error handling
      yield* _(Effect.logError(`Failed to parse IPFS metadata for proposal ${validIpfsMetadata}`));
      return null;
    }

    switch (validIpfsMetadata.type) {
      case 'ADD_EDIT': {
        const parsedContent = yield* _(Decoder.decodeEdit(ipfsContent));

        // Subspace proposals are only emitted by the voting plugin
        if (!parsedContent) {
          return null;
        }

        const mappedProposal: EditProposal = {
          ...proposal,
          type: 'ADD_EDIT',
          metadataUri: proposal.contentUri,
          name: validIpfsMetadata.name ?? null,
          proposalId: parsedContent.id,
          onchainProposalId: proposal.proposalId,
          pluginAddress: getChecksumAddress(proposal.pluginAddress),
          ops: parsedContent.ops.map((op): Op => {
            if (op.type === 'SET_TRIPLE') {
              return {
                type: 'SET_TRIPLE',
                space: maybeSpace.id,
                triple: op.triple,
              } as SetTripleOp;
            }

            return {
              type: 'DELETE_TRIPLE',
              space: maybeSpace.id,
              triple: {
                attribute: op.triple.attribute,
                entity: op.triple.entity,
                value: {},
              },
            };
          }),
          creator: getChecksumAddress(proposal.creator),
          space: maybeSpace.id,
        };

        return mappedProposal;
      }

      // case 'ADD_SUBSPACE':
      // case 'REMOVE_SUBSPACE': {
      //   const parsedSubspace = yield* _(Decoder.decodeSubspace(ipfsContent));

      //   // Subspace proposals are only emitted by the voting plugin
      //   if (!parsedSubspace || !maybeSpace.id) {
      //     return null;
      //   }

      //   const maybeSpaceIdForSubspaceDaoAddress = yield* _(
      //     Effect.promise(() => Spaces.findForDaoAddress(getChecksumAddress(parsedSubspace.subspace)))
      //   );

      //   if (!maybeSpaceIdForSubspaceDaoAddress) {
      //     yield* _(Effect.logError(`Failed to get space for subspace DAO address ${parsedSubspace.subspace}`));
      //     return null;
      //   }

      //   const mappedProposal: SubspaceProposal = {
      //     ...proposal,
      //     metadataUri: proposal.contentUri,
      //     type: validIpfsMetadata.type,
      //     name: `Add subspace: ${maybeSpaceIdForSubspaceDaoAddress.id}`,
      //     proposalId: deriveProposalId({
      //       pluginAddress: proposal.pluginAddress,
      //       onchainProposalId: proposal.proposalId,
      //     }),
      //     onchainProposalId: proposal.proposalId,
      //     pluginAddress: getChecksumAddress(proposal.pluginAddress),
      //     subspace: maybeSpaceIdForSubspaceDaoAddress.id, // this should be the space id
      //     creator: getChecksumAddress(proposal.creator),
      //     space: maybeSpace.id,
      //   };

      //   return mappedProposal;
      // }

      // case 'ADD_EDITOR':
      // case 'REMOVE_EDITOR': {
      //   const parsedMembership = yield* _(Decoder.decodeEditorship(ipfsContent));

      //   if (!parsedMembership) {
      //     return null;
      //   }

      //   // If both of these are null then we already early exit out of this function, so it's safe to cast
      //   // to the correct type here.
      //   const spaceId = maybeSpaceIdForMembershipPlugin ?? maybeSpace.id;

      //   const mappedProposal: EditorshipProposal = {
      //     ...proposal,
      //     metadataUri: proposal.contentUri,
      //     type: validIpfsMetadata.type,
      //     name: `Add Editor: ${parsedMembership.user}`,
      //     proposalId: deriveProposalId({
      //       pluginAddress: proposal.pluginAddress,
      //       onchainProposalId: proposal.proposalId,
      //     }),
      //     onchainProposalId: proposal.proposalId,
      //     pluginAddress: getChecksumAddress(proposal.pluginAddress),
      //     user: getChecksumAddress(parsedMembership.user),
      //     creator: getChecksumAddress(proposal.creator),
      //     space: spaceId as string,
      //   };

      //   return mappedProposal;
      // }

      // case 'ADD_MEMBER':
      // case 'REMOVE_MEMBER': {
      //   const parsedMembership = yield* _(Decoder.decodeMembership(ipfsContent));

      //   if (!parsedMembership) {
      //     return null;
      //   }

      //   // If both of these are null then we already early exit out of this function, so it's safe to cast
      //   // to the correct type here.
      //   const spaceId = maybeSpaceIdForMembershipPlugin ?? maybeSpace.id;

      //   const mappedProposal: MembershipProposal = {
      //     ...proposal,
      //     metadataUri: proposal.contentUri,
      //     type: validIpfsMetadata.type,
      //     name: `Add Member: ${parsedMembership.user}`,
      //     proposalId: deriveProposalId({
      //       pluginAddress: proposal.pluginAddress,
      //       onchainProposalId: proposal.proposalId,
      //     }),
      //     onchainProposalId: proposal.proposalId,
      //     pluginAddress: getChecksumAddress(proposal.pluginAddress),
      //     user: getChecksumAddress(parsedMembership.user),
      //     creator: getChecksumAddress(proposal.creator),
      //     space: spaceId as string,
      //   };

      //   return mappedProposal;
      // }
      default:
        yield* _(Effect.logError(`Unsupported content type ${validIpfsMetadata.type}`));
        return null;
    }
  });
}
