import { Effect, Either } from 'effect';

import { Space } from '~/core/io/dto/spaces';
import { getSpace, getSpaceByAddress, getSpaces } from '~/core/io/queries';
import { Profile } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { defaultProfile } from './fetch-profile-via-wallets-triple';

/**
 * Fetch a user's profile from their wallet address.
 *
 * Flow:
 * 1. Look up the user's personal space ID via their wallet address
 * 2. Fetch the space entity to get profile data (name, avatar)
 *
 * Returns a default profile if the user doesn't have a registered space or if fetching fails.
 */
export function fetchProfile(walletAddress: string): Effect.Effect<Profile, never, never> {
  return Effect.gen(function* () {
    const space = yield* Effect.either(getSpaceByAddress(walletAddress));

    if (Either.isLeft(space)) {
      console.error(`Failed to fetch space for wallet ${walletAddress}:`, space.left);
      return defaultProfile(walletAddress, walletAddress);
    }

    if (!space.right) {
      // User doesn't have a registered personal space
      return defaultProfile(walletAddress, walletAddress);
    }

    return spaceToProfile(space.right, walletAddress);
  });
}

/**
 * Fetch a user's profile from their personal space ID.
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
    const space = yield* Effect.either(getSpace(spaceId));

    if (Either.isLeft(space)) {
      console.error(`Failed to fetch profile for spaceId ${spaceId}:`, space.left);
      return defaultProfile(walletAddressHint ?? spaceId, spaceId);
    }

    if (!space.right) {
      return defaultProfile(walletAddressHint ?? spaceId, spaceId);
    }

    return spaceToProfile(space.right, walletAddressHint);
  });
}

/**
 * Fetch multiple profiles by their space IDs in a single batch request.
 *
 * More efficient than calling fetchProfileBySpaceId multiple times.
 */
export function fetchProfilesBySpaceIds(spaceIds: string[]): Effect.Effect<Profile[], never, never> {
  if (spaceIds.length === 0) {
    return Effect.succeed([]);
  }

  const uniqueSpaceIds = [...new Set(spaceIds)];

  return Effect.gen(function* () {
    const spaces = yield* Effect.either(getSpaces({ spaceIds: uniqueSpaceIds }));

    if (Either.isLeft(spaces)) {
      console.error(`Failed to fetch profiles for spaceIds:`, spaces.left);
      return uniqueSpaceIds.map(spaceId => defaultProfile(spaceId, spaceId));
    }

    // Create a map for O(1) lookup
    const spaceMap = new Map(spaces.right.map(space => [space.id, space]));

    // Return profiles in the same order as requested, with defaults for missing spaces
    return uniqueSpaceIds.map(spaceId => {
      const space = spaceMap.get(spaceId);
      return space ? spaceToProfile(space) : defaultProfile(spaceId, spaceId);
    });
  });
}

function spaceToProfile(space: Space, walletAddressHint?: string): Profile {
  const spaceId = space.id;
  const entity = space.entity;

  if (!entity) {
    return defaultProfile(walletAddressHint ?? spaceId, spaceId);
  }

  return {
    id: entity.id || spaceId,
    spaceId,
    name: entity.name,
    avatarUrl: entity.image,
    coverUrl: null,
    address: (space.address || walletAddressHint || spaceId) as `0x${string}`,
    profileLink: NavUtils.toSpace(spaceId),
  };
}
