import { Effect } from 'effect';

import { getSpace } from '~/core/io/queries';
import { Profile } from '~/core/types';
import { getPersonalSpaceId } from '~/core/utils/contracts/get-personal-space-id';
import { NavUtils } from '~/core/utils/utils';

import { defaultProfile } from './fetch-profile-via-wallets-triple';

export interface FetchProfileOptions {
  /** Wallet address (0x...) - will be converted to personal space ID */
  walletAddress: string;
}

/**
 * Fetch a user's profile from their wallet address.
 *
 * This function:
 * 1. Converts the wallet address to a personal space ID via SpaceRegistry contract
 * 2. Fetches the space entity to get profile data (name, avatar)
 */
export async function fetchProfile(options: FetchProfileOptions): Promise<Profile> {
  const { walletAddress } = options;

  try {
    // Convert wallet address to personal space ID
    const personalSpaceId = await getPersonalSpaceId(walletAddress);

    if (!personalSpaceId) {
      // User doesn't have a registered personal space
      return defaultProfile(walletAddress);
    }

    return fetchProfileBySpaceId(personalSpaceId, walletAddress);
  } catch (error) {
    console.error(`Failed to fetch profile for wallet ${walletAddress}:`, error);
    return defaultProfile(walletAddress);
  }
}

/**
 * Fetch a user's profile from their personal space ID.
 *
 * Use this when you already have the personal space ID (e.g., from space members/editors list).
 * For fetching from a wallet address, use fetchProfile() instead.
 */
export async function fetchProfileBySpaceId(personalSpaceId: string, addressHint?: string): Promise<Profile> {
  try {
    const space = await Effect.runPromise(getSpace(personalSpaceId));

    if (!space || !space.entity) {
      return defaultProfile(addressHint ?? personalSpaceId);
    }

    return {
      id: space.entity.id || personalSpaceId,
      name: space.entity.name,
      avatarUrl: space.entity.image,
      coverUrl: null,
      // Use the space's actual address if available, otherwise use the hint or space ID
      address: (space.address || addressHint || personalSpaceId) as `0x${string}`,
      profileLink: NavUtils.toSpace(personalSpaceId),
    };
  } catch (error) {
    console.error(`Failed to fetch profile for spaceId ${personalSpaceId}:`, error);
    return defaultProfile(addressHint ?? personalSpaceId);
  }
}
