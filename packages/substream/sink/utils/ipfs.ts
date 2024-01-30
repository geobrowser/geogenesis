import { Effect, Either, Schedule } from 'effect';

import { IPFS_GATEWAY } from '../constants/constants.js';
import {
  type ContentProposal,
  type Entry,
  type FullEntry,
  type MembershipProposal,
  type Proposal,
  type SubspaceProposal,
  type UriData,
  ZodContentProposal,
  ZodMembershipProposal,
  ZodProposalMetadata,
  ZodSubspaceProposal,
} from '../zod.js';
import { isValidAction } from './actions.js';
import { getChecksumAddress } from './get-checksum-address.js';

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
  never,
  UnableToParseBase64Error | FailedFetchingIpfsContentError | UnableToParseJsonError,
  UriData | null
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

      // @TODO: Add max retry time before erroring out
      const response = yield* unwrap(Effect.retry(ipfsFetchEffect, Schedule.exponential('1 seconds')));

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

export function getEntryWithIpfsContent(entry: Entry): Effect.Effect<never, never, FullEntry | null> {
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
 * 1. Fetch the IPFS content
 * 2. Parse the IPFS content to get the "type"
 * 3. Return an object matching the type and the expected contents.
 *
 * Later on we map this to the database schema and write the proposal to the database.
 */
export function getProposalFromMetadata(
  proposal: Proposal
): Effect.Effect<never, never, ContentProposal | SubspaceProposal | MembershipProposal | null> {
  return Effect.gen(function* (unwrap) {
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

    console.log('maybeIpfsContent', ipfsContent);

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
          onchainProposalId: parsedContent.data.proposalId,
          actions: parsedContent.data.actions.filter(isValidAction),
          creator: getChecksumAddress(proposal.creator),
          space: getChecksumAddress(proposal.space),
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
          onchainProposalId: parsedSubspace.data.proposalId,
          subspace: getChecksumAddress(parsedSubspace.data.subspace),
          creator: getChecksumAddress(proposal.creator),
          space: getChecksumAddress(proposal.space),
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
          onchainProposalId: parsedMembership.data.proposalId,
          userAddress: getChecksumAddress(parsedMembership.data.userAddress),
          creator: getChecksumAddress(proposal.creator),
          space: getChecksumAddress(proposal.space),
        };

        return mappedProposal;
      }
    }
  });
}
