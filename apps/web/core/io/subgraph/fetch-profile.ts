import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import {
  restFetch,
  ApiProfileSchema,
  ApiBatchProfileResponseSchema,
  encodePathSegment,
  validateWalletAddress,
  type ApiProfile,
} from '../rest';

export function defaultProfile(address: string, spaceId?: string): Profile {
  return {
    id: address,
    spaceId: spaceId ?? address,
    address: address as `0x${string}`,
    avatarUrl: null,
    coverUrl: null,
    name: null,
    profileLink: null,
  };
}

/**
 * Convert API profile response to the app's Profile type.
 */
function apiProfileToProfile(apiProfile: ApiProfile): Profile {
  return {
    id: apiProfile.spaceId,
    spaceId: apiProfile.spaceId,
    name: apiProfile.name,
    avatarUrl: apiProfile.avatarUrl,
    coverUrl: null,
    address: apiProfile.address as `0x${string}`,
    profileLink: NavUtils.toSpace(apiProfile.spaceId),
  };
}

/**
 * Fetch a user's profile from their wallet address.
 *
 * Uses the REST endpoint: GET /profile/address/:address
 *
 * Returns a default profile if the user doesn't have a registered space or if fetching fails.
 */
export function fetchProfile(walletAddress: string): Effect.Effect<Profile, never, never> {
  return Effect.gen(function* () {
    const config = Environment.getConfig();

    // Validate and normalize the wallet address
    const normalizedAddress = validateWalletAddress(walletAddress);
    if (!normalizedAddress) {
      console.error(`Invalid wallet address format: ${walletAddress}`);
      return defaultProfile(walletAddress, walletAddress);
    }

    const result = yield* Effect.either(
      restFetch<unknown>({
        endpoint: config.api,
        path: `/profile/address/${encodePathSegment(normalizedAddress)}`,
      })
    );

    if (Either.isLeft(result)) {
      console.error(`Failed to fetch profile for wallet ${walletAddress}:`, result.left);
      return defaultProfile(walletAddress, walletAddress);
    }

    const decoded = Schema.decodeUnknownEither(ApiProfileSchema)(result.right);

    if (Either.isLeft(decoded)) {
      console.error(`Failed to decode profile for wallet ${walletAddress}:`, decoded.left);
      return defaultProfile(walletAddress, walletAddress);
    }

    const apiProfile = decoded.right;

    // API returns a profile with null fields if not found
    // Check if we have actual profile data
    if (!apiProfile.name && !apiProfile.avatarUrl) {
      return defaultProfile(walletAddress, apiProfile.spaceId);
    }

    return apiProfileToProfile(apiProfile);
  });
}

/**
 * Fetch a user's profile from their personal space ID.
 *
 * Uses the REST endpoint: GET /profile/space/:spaceId
 *
 * Use this when you already have the space ID (e.g., from space members/editors list).
 * For fetching from a wallet address, use fetchProfile() instead.
 *
 * @param spaceId - The user's personal space ID (bytes16 hex without 0x prefix)
 * @param walletAddressHint - Optional wallet address to use if the space doesn't have an address.
 *                            Useful when the caller already knows the wallet but needs profile data.
 */
export function fetchProfileBySpaceId(
  spaceId: string,
  walletAddressHint?: string
): Effect.Effect<Profile, never, never> {
  return Effect.gen(function* () {
    const config = Environment.getConfig();

    const result = yield* Effect.either(
      restFetch<unknown>({
        endpoint: config.api,
        path: `/profile/space/${encodePathSegment(spaceId)}`,
      })
    );

    if (Either.isLeft(result)) {
      console.error(`Failed to fetch profile for spaceId ${spaceId}:`, result.left);
      return defaultProfile(walletAddressHint ?? spaceId, spaceId);
    }

    const decoded = Schema.decodeUnknownEither(ApiProfileSchema)(result.right);

    if (Either.isLeft(decoded)) {
      console.error(`Failed to decode profile for spaceId ${spaceId}:`, decoded.left);
      return defaultProfile(walletAddressHint ?? spaceId, spaceId);
    }

    const apiProfile = decoded.right;

    // API returns a profile with null fields if not found
    // Check if we have actual profile data or use the hint
    if (!apiProfile.name && !apiProfile.avatarUrl) {
      return defaultProfile(walletAddressHint ?? apiProfile.address, apiProfile.spaceId);
    }

    // If we have a wallet address hint and the API didn't return one, use the hint
    const profile = apiProfileToProfile(apiProfile);
    if (walletAddressHint && profile.address === profile.spaceId) {
      return { ...profile, address: walletAddressHint as `0x${string}` };
    }

    return profile;
  });
}

/**
 * Fetch multiple profiles by their space IDs in a single batch request.
 *
 * Uses the REST endpoint: POST /profile/batch
 *
 * More efficient than calling fetchProfileBySpaceId multiple times.
 * Returns profiles in the same order as the input array, preserving duplicates.
 */
export function fetchProfilesBySpaceIds(spaceIds: string[]): Effect.Effect<Profile[], never, never> {
  if (spaceIds.length === 0) {
    return Effect.succeed([]);
  }

  // Deduplicate for the API call, but preserve original order for return
  const uniqueSpaceIds = [...new Set(spaceIds)];

  return Effect.gen(function* () {
    const config = Environment.getConfig();

    const result = yield* Effect.either(
      restFetch<unknown>({
        endpoint: config.api,
        path: '/profile/batch',
        method: 'POST',
        body: { spaceIds: uniqueSpaceIds },
      })
    );

    if (Either.isLeft(result)) {
      console.error(`Failed to fetch profiles for spaceIds:`, result.left);
      return spaceIds.map(spaceId => defaultProfile(spaceId, spaceId));
    }

    const decoded = Schema.decodeUnknownEither(ApiBatchProfileResponseSchema)(result.right);

    if (Either.isLeft(decoded)) {
      console.error(`Failed to decode profiles for spaceIds:`, decoded.left);
      return spaceIds.map(spaceId => defaultProfile(spaceId, spaceId));
    }

    // Create a map for O(1) lookup
    const profileMap = new Map(decoded.right.profiles.map(p => [p.spaceId, apiProfileToProfile(p)]));

    // Return profiles in the original order (including duplicates)
    return spaceIds.map(spaceId => {
      const profile = profileMap.get(spaceId);
      return profile ?? defaultProfile(spaceId, spaceId);
    });
  });
}
