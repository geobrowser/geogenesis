import { Effect, Either } from 'effect';

import {
  type ContentProposal,
  type EditorshipProposal,
  type MembershipProposal,
  type ProposalCreated,
  type SubspaceProposal,
  ZodContentProposal,
  ZodMembershipProposal,
  ZodProposalMetadata,
  ZodSubspaceProposal,
} from './parser';
import { Spaces } from '~/sink/db';
import type { SpaceWithPluginAddressNotFoundError } from '~/sink/errors';
import type { BlockEvent } from '~/sink/types';
import { isValidAction } from '~/sink/utils/actions';
import { getChecksumAddress } from '~/sink/utils/get-checksum-address';
import { getFetchIpfsContentEffect } from '~/sink/utils/ipfs';
import { slog } from '~/sink/utils/slog';

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
export function getProposalFromCreatedProposalIpfsUri(
  proposal: ProposalCreated,
  block: BlockEvent
): Effect.Effect<
  ContentProposal | SubspaceProposal | MembershipProposal | EditorshipProposal | null,
  SpaceWithPluginAddressNotFoundError
> {
  return Effect.gen(function* (unwrap) {
    // The proposal can come from either the voting plugin or the membership plugin
    // depending on which type of proposal is being processed
    const maybeSpaceIdForVotingPlugin = yield* unwrap(
      Effect.promise(() => Spaces.findForVotingPlugin(proposal.pluginAddress))
    );
    const maybeSpaceIdForMembershipPlugin = yield* unwrap(
      Effect.promise(() => Spaces.findForMembershipPlugin(proposal.pluginAddress))
    );

    if (!maybeSpaceIdForVotingPlugin && !maybeSpaceIdForMembershipPlugin) {
      slog({
        message: `Matching space in Proposal not found for plugin address ${proposal.pluginAddress}`,
        requestId: block.requestId,
      });

      return null;
    }

    slog({
      message: `Fetching IPFS content for proposal
        proposalId:    ${proposal.proposalId}
        pluginAddress: ${proposal.pluginAddress}
        creator:       ${proposal.creator}
        metadataUri:   ${proposal.metadataUri}
        startTime:     ${proposal.startTime}
        endTime:       ${proposal.endTime}`,
      requestId: block.requestId,
    });

    const fetchIpfsContentEffect = getFetchIpfsContentEffect(proposal.metadataUri);
    const maybeIpfsContent = yield* unwrap(Effect.either(fetchIpfsContentEffect));

    if (Either.isLeft(maybeIpfsContent)) {
      const error = maybeIpfsContent.left;

      switch (error._tag) {
        case 'UnableToParseBase64Error':
          console.error(`Unable to parse base64 string ${proposal.metadataUri}`, error);
          break;
        case 'FailedFetchingIpfsContentError':
          console.error(`Failed fetching IPFS content from uri ${proposal.metadataUri}`, error);
          break;
        case 'UnableToParseJsonError':
          console.error(`Unable to parse JSON when reading content from uri ${proposal.metadataUri}`, error);
          break;
        case 'TimeoutException':
          console.error(`Timed out when fetching IPFS content for uri ${proposal.metadataUri}`, error);
          break;
        default:
          console.error(`Unknown error when fetching IPFS content for uri ${proposal.metadataUri}`, error);
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
      case 'CONTENT': {
        const parsedContent = ZodContentProposal.safeParse(ipfsContent);

        // Subspace proposals are only emitted by the voting plugin
        if (!parsedContent.success || !maybeSpaceIdForVotingPlugin) {
          return null;
        }

        const mappedProposal: ContentProposal = {
          ...proposal,
          type: validIpfsMetadata.data.type,
          name: validIpfsMetadata.data.name ?? null,
          proposalId: parsedContent.data.proposalId,
          onchainProposalId: proposal.proposalId,
          pluginAddress: getChecksumAddress(proposal.pluginAddress),
          actions: parsedContent.data.actions.filter(isValidAction),
          creator: getChecksumAddress(proposal.creator),
          space: getChecksumAddress(maybeSpaceIdForVotingPlugin),
        };

        return mappedProposal;
      }

      case 'ADD_SUBSPACE':
      case 'REMOVE_SUBSPACE': {
        // @TODO: ipfs content type is not correct for non-content-type proposals
        const parsedSubspace = ZodSubspaceProposal.safeParse(ipfsContent);

        // Subspace proposals are only emitted by the voting plugin
        if (!parsedSubspace.success || !maybeSpaceIdForVotingPlugin) {
          return null;
        }

        const mappedProposal: SubspaceProposal = {
          ...proposal,
          type: validIpfsMetadata.data.type,
          name: validIpfsMetadata.data.name ?? null,
          proposalId: parsedSubspace.data.proposalId,
          onchainProposalId: proposal.proposalId,
          pluginAddress: getChecksumAddress(proposal.pluginAddress),
          subspace: getChecksumAddress(parsedSubspace.data.subspace),
          creator: getChecksumAddress(proposal.creator),
          space: getChecksumAddress(maybeSpaceIdForVotingPlugin),
        };

        return mappedProposal;
      }

      case 'ADD_EDITOR':
      case 'REMOVE_EDITOR':
        const parsedMembership = ZodMembershipProposal.safeParse(ipfsContent);

        if (!parsedMembership.success) {
          return null;
        }

        // If both of these are null then we already early exit out of this function, so it's safe to cast
        // to the correct type here.
        const spaceAddress = (maybeSpaceIdForMembershipPlugin ?? maybeSpaceIdForVotingPlugin) as `0x${string}`;

        const mappedProposal: EditorshipProposal = {
          ...proposal,
          type: validIpfsMetadata.data.type,
          name: validIpfsMetadata.data.name ?? null,
          proposalId: parsedMembership.data.proposalId,
          onchainProposalId: proposal.proposalId,
          pluginAddress: getChecksumAddress(proposal.pluginAddress),
          userAddress: getChecksumAddress(parsedMembership.data.userAddress),
          creator: getChecksumAddress(proposal.creator),
          space: getChecksumAddress(spaceAddress),
        };

        return mappedProposal;

      case 'ADD_MEMBER':
      case 'REMOVE_MEMBER': {
        const parsedMembership = ZodMembershipProposal.safeParse(ipfsContent);

        if (!parsedMembership.success) {
          return null;
        }

        // If both of these are null then we already early exit out of this function, so it's safe to cast
        // to the correct type here.
        const spaceAddress = (maybeSpaceIdForMembershipPlugin ?? maybeSpaceIdForVotingPlugin) as `0x${string}`;

        const mappedProposal: MembershipProposal = {
          ...proposal,
          type: validIpfsMetadata.data.type,
          name: validIpfsMetadata.data.name ?? null,
          proposalId: parsedMembership.data.proposalId,
          onchainProposalId: proposal.proposalId,
          pluginAddress: getChecksumAddress(proposal.pluginAddress),
          userAddress: getChecksumAddress(parsedMembership.data.userAddress),
          creator: getChecksumAddress(proposal.creator),
          space: getChecksumAddress(spaceAddress),
        };

        return mappedProposal;
      }
    }
  });
}
