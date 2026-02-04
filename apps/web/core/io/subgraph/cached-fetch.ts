/**
 * Cached versions of fetch functions for use in React Server Components.
 *
 * These use React's cache() to deduplicate requests within a single render pass.
 * This is especially useful when multiple components need the same data.
 */
import { Effect } from 'effect';
import { cache } from 'react';

import { fetchProfile, fetchProfileBySpaceId, fetchProfilesBySpaceIds } from './fetch-profile';
import { fetchProposal, type FetchProposalOptions } from './fetch-proposal';
import { fetchProposals, type FetchProposalsOptions } from './fetch-proposals';

/**
 * Cached profile fetch by wallet address.
 * Deduplicates requests for the same wallet within a render pass.
 */
export const cachedFetchProfile = cache(async (walletAddress: string) => {
  return Effect.runPromise(fetchProfile(walletAddress));
});

/**
 * Cached profile fetch by space ID.
 * Deduplicates requests for the same space within a render pass.
 */
export const cachedFetchProfileBySpaceId = cache(async (spaceId: string, walletAddressHint?: string) => {
  return Effect.runPromise(fetchProfileBySpaceId(spaceId, walletAddressHint));
});

/**
 * Cached batch profile fetch.
 * Deduplicates requests for the same set of space IDs within a render pass.
 *
 * Note: Cache key is based on the serialized array, so order matters.
 * Consider sorting spaceIds before calling if order is not important.
 */
export const cachedFetchProfilesBySpaceIds = cache(async (spaceIds: string[]) => {
  return Effect.runPromise(fetchProfilesBySpaceIds(spaceIds));
});

/**
 * Cached single proposal fetch.
 * Deduplicates requests for the same proposal within a render pass.
 */
export const cachedFetchProposal = cache(async (options: FetchProposalOptions) => {
  return fetchProposal(options);
});

/**
 * Cached proposals list fetch.
 * Deduplicates requests for the same space/page within a render pass.
 */
export const cachedFetchProposals = cache(async (options: FetchProposalsOptions) => {
  return fetchProposals(options);
});
