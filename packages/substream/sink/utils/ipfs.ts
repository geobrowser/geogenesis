import { Duration, Effect, Either, Schedule } from 'effect';
import type { TimeoutException } from 'effect/Cause';

import { IPFS_GATEWAY } from '../constants/constants';
import { Spaces } from '../db';
import { SpaceWithPluginAddressNotFoundError } from '../errors';
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
} from '../events/proposals-created/parser';
import { type UriData } from '../zod';
import { isValidAction } from './actions';
import { getChecksumAddress } from './get-checksum-address';
import { slog } from './slog';

class UnableToParseBase64Error extends Error {
  _tag: 'UnableToParseBase64Error' = 'UnableToParseBase64Error';
}

class FailedFetchingIpfsContentError extends Error {
  _tag: 'FailedFetchingIpfsContentError' = 'FailedFetchingIpfsContentError';
}

class UnableToParseJsonError extends Error {
  _tag: 'UnableToParseJsonError' = 'UnableToParseJsonError';
}

function getFetchIpfsContentEffect(
  uri: string
): Effect.Effect<
  UriData | null,
  UnableToParseBase64Error | FailedFetchingIpfsContentError | UnableToParseJsonError | TimeoutException,
  never
> {
  return Effect.gen(function* (unwrap) {
    if (uri.startsWith('data:application/json;base64,')) {
      const base64 = uri.split(',')[1];

      if (!base64) {
        return null;
      }

      const decoded = Effect.try({
        try: () => {
          return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as UriData;
        },
        catch: error => {
          return new UnableToParseBase64Error(`Unable to parse base64 string ${uri}. ${String(error)}`);
        },
      });

      return yield* unwrap(decoded);
    }

    if (uri.startsWith('ipfs://')) {
      const ipfsFetchEffect = Effect.tryPromise({
        try: async () => {
          const parsedCid = uri.replace('ipfs://', '');
          const url = `${IPFS_GATEWAY}${parsedCid}`;

          return await fetch(url);
        },
        catch: error => {
          return new FailedFetchingIpfsContentError(`Failed fetching IPFS content from uri ${uri}. ${String(error)}`);
        },
      });

      const response = yield* unwrap(
        // Attempt to fetch with jittered exponential backoff for 60 seconds before failing
        Effect.retry(
          ipfsFetchEffect.pipe(Effect.timeout(Duration.seconds(60))),
          Schedule.exponential(100).pipe(
            Schedule.jittered,
            Schedule.compose(Schedule.elapsed),
            // Retry for 1 minute.
            Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(60)))
          )
        )
      );

      return yield* unwrap(
        Effect.tryPromise({
          try: async () => {
            return (await response.json()) as UriData;
          },
          catch: error =>
            new UnableToParseJsonError(`Unable to parse JSON when reading content from uri ${uri}. ${String(error)}`),
        })
      );
    }

    // We only support IPFS URIs or base64 encoded content with the above format
    return null;
  });
}

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
export function getProposalFromMetadata(
  proposal: ProposalCreated
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
        requestId: '-1',
      });

      return null;
    }

    slog({
      message: `Fetching IPFS content for proposal, ${JSON.stringify(proposal, null, 2)}`,
      requestId: '-1',
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
          actions: parsedContent.data.actions.filter(isValidAction),
          creator: getChecksumAddress(proposal.creator),
          space: getChecksumAddress(maybeSpaceIdForVotingPlugin),
          // json: JSON.stringify(ipfsContent),
          // uri: proposal.metadataUri,
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
          subspace: getChecksumAddress(parsedSubspace.data.subspace),
          creator: getChecksumAddress(proposal.creator),
          space: getChecksumAddress(maybeSpaceIdForVotingPlugin),
          // json: JSON.stringify(ipfsContent),
          // uri: proposal.metadataUri,
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
          userAddress: getChecksumAddress(parsedMembership.data.userAddress),
          creator: getChecksumAddress(proposal.creator),
          space: getChecksumAddress(spaceAddress),
          // json: JSON.stringify(ipfsContent),
          // uri: proposal.metadataUri,
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
          userAddress: getChecksumAddress(parsedMembership.data.userAddress),
          creator: getChecksumAddress(proposal.creator),
          space: getChecksumAddress(spaceAddress),
          // json: JSON.stringify(ipfsContent),
          // uri: proposal.metadataUri,
        };

        return mappedProposal;
      }
    }
  });
}

class InvalidProcessedProposalContentTypeError extends Error {
  _tag: 'InvalidProcessedProposalContentTypeError' = 'InvalidProcessedProposalContentTypeError';
}

export function getProposalFromProcessedProposal(
  processedProposal: {
    ipfsUri: string;
    pluginAddress: string;
  },
  timestamp: number
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
        requestId: '-1',
      });

      return null;
    }

    slog({
      message: `Fetching IPFS content for processed proposal, ${JSON.stringify(processedProposal, null, 2)}`,
      requestId: '-1',
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
          space: getChecksumAddress(maybeSpaceIdForVotingPlugin),
          endTime: timestamp.toString(),
          startTime: timestamp.toString(),
          metadataUri: processedProposal.ipfsUri,
        };

        return contentProposal;
    }

    yield* unwrap(
      Effect.fail(new InvalidProcessedProposalContentTypeError('Invalid processed proposal content type.'))
    );

    return null;
  });
}
