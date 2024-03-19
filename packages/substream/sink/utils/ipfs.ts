import { Duration, Effect, Either, Schedule } from 'effect';
import type { TimeoutException } from 'effect/Cause';

import { IPFS_GATEWAY } from '../constants/constants.js';
import { SpaceWithPluginAddressNotFoundError } from '../errors.js';
import { slog } from '../utils.js';
import {
  type Action,
  type ContentProposal,
  type Entry,
  type FullEntry,
  type MembershipProposal,
  type SubspaceProposal,
  type SubstreamProposal,
  type UriData,
  ZodContentProposal,
  ZodMembershipProposal,
  ZodProposalMetadata,
  ZodSubspaceProposal,
} from '../zod.js';
import { isValidAction } from './actions.js';
import { getChecksumAddress } from './get-checksum-address.js';
import { getSpaceForSpacePlugin } from './get-space-for-space-plugin.js';
import { getSpaceForVotingPlugin } from './get-space-for-voting-plugin.js';

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

export function getEntryWithIpfsContent(entry: Entry): Effect.Effect<FullEntry | null> {
  return Effect.gen(function* (unwrap) {
    const fetchIpfsContentEffect = getFetchIpfsContentEffect(entry.uri);

    const maybeIpfsContent = yield* unwrap(Effect.either(fetchIpfsContentEffect));

    if (Either.isLeft(maybeIpfsContent)) {
      const error = maybeIpfsContent.left;

      switch (error._tag) {
        case 'UnableToParseBase64Error':
          console.error(`Unable to parse base64 string ${entry.uri}`, error);
          break;
        case 'FailedFetchingIpfsContentError':
          console.error(`Failed fetching IPFS content from uri ${entry.uri}`, error);
          break;
        case 'UnableToParseJsonError':
          console.error(`Unable to parse JSON when reading content from uri ${entry.uri}`, error);
          break;
        default:
          console.error(`Unknown error when fetching IPFS content for uri ${entry.uri}`, error);
          break;
      }

      return null;
    }

    const ipfsContent = maybeIpfsContent.right;

    if (!ipfsContent) {
      return null;
    }

    return {
      ...entry,
      uriData: ipfsContent,
    };
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
  proposal: SubstreamProposal
): Effect.Effect<ContentProposal | SubspaceProposal | MembershipProposal | null, SpaceWithPluginAddressNotFoundError> {
  return Effect.gen(function* (unwrap) {
    const maybeSpaceIdForPlugin = yield* unwrap(getSpaceForVotingPlugin(getChecksumAddress(proposal.pluginAddress)));

    if (!maybeSpaceIdForPlugin) {
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
      case 'content': {
        const parsedContent = ZodContentProposal.safeParse(ipfsContent);

        if (!parsedContent.success) {
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
          space: getChecksumAddress(maybeSpaceIdForPlugin),
        };

        return mappedProposal;
      }

      case 'add_subspace':
      case 'remove_subspace': {
        const parsedSubspace = ZodSubspaceProposal.safeParse(ipfsContent);

        if (!parsedSubspace.success) {
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
          space: getChecksumAddress(maybeSpaceIdForPlugin),
        };

        return mappedProposal;
      }

      case 'add_editor':
      case 'remove_editor':
      case 'add_member':
      case 'remove_member': {
        const parsedMembership = ZodMembershipProposal.safeParse(ipfsContent);

        if (!parsedMembership.success) {
          return null;
        }

        const mappedProposal: MembershipProposal = {
          ...proposal,
          type: validIpfsMetadata.data.type,
          name: validIpfsMetadata.data.name ?? null,
          proposalId: parsedMembership.data.proposalId,
          onchainProposalId: proposal.proposalId,
          userAddress: getChecksumAddress(parsedMembership.data.userAddress),
          creator: getChecksumAddress(proposal.creator),
          space: getChecksumAddress(maybeSpaceIdForPlugin),
        };

        return mappedProposal;
      }
    }
  });
}

class InvalidProcessedProposalContentTypeError extends Error {
  _tag: 'InvalidProcessedProposalContentTypeError' = 'InvalidProcessedProposalContentTypeError';
}

export function getProposalIdFromProcessedProposal(processedProposal: {
  ipfsUri: string;
  pluginAddress: string;
}): Effect.Effect<
  { id: string; actions: Action[] } | null,
  SpaceWithPluginAddressNotFoundError | InvalidProcessedProposalContentTypeError
> {
  return Effect.gen(function* (unwrap) {
    const maybeSpaceIdForPlugin = yield* unwrap(
      getSpaceForSpacePlugin(getChecksumAddress(processedProposal.pluginAddress))
    );

    if (!maybeSpaceIdForPlugin) {
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
      case 'content':
        const parsedContent = ZodContentProposal.safeParse(ipfsContent);

        if (!parsedContent.success) {
          return null;
        }

        return {
          id: parsedContent.data.proposalId,
          actions: parsedContent.data.actions.filter(isValidAction),
        };
    }

    yield* unwrap(
      Effect.fail(new InvalidProcessedProposalContentTypeError('Invalid processed proposal content type.'))
    );

    return null;
  });
}
