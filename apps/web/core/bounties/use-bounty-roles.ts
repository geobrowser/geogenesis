'use client';

import * as React from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { uuidToHex } from '~/core/id/normalize';

import { buildBountyAllocationTargets } from './bounty-dto';
import type { BountyBacklink } from './fetch-bounty-detail';
import { filterOwnInterestRows } from './interest-identity';
import type { BoardBounty } from './types';

export type BountyRoles = {
  /** The signed-in user's person entity id, when their profile has resolved. */
  personId: string | null;
  personalSpaceId: string | null;
  isSignedIn: boolean;
  /** Editor of the bounty's DAO space — may create/edit bounties, allocate, review, pay out. */
  isEditor: boolean;
  isMaintainer: boolean;
  isAllocated: boolean;
  isInterested: boolean;
  /** Interest rows authored by this user (may be several — cancel must delete all). */
  ownInterestRows: BountyBacklink[];
  isLoading: boolean;
};

/**
 * Every permission branch in the bounty UI goes through this one hook. Identity
 * is the user's person entity and personal space (allocation and interest may
 * target either), editorship is space access in the bounty's DAO space.
 */
export function useBountyRoles(
  bounty: BoardBounty | null | undefined,
  interest: readonly BountyBacklink[] = []
): BountyRoles {
  const { smartAccount, isLoading: isLoadingAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const { profile, isLoading: isLoadingProfile } = useGeoProfile(address);
  const { personalSpaceId, isLoading: isLoadingSpace } = usePersonalSpaceId();
  const access = useAccessControl(bounty?.spaceId ?? '');

  return React.useMemo(() => {
    const personId = profile?.id && profile.id !== profile.spaceId && !profile.id.startsWith('0x') ? profile.id : null;
    const targets = new Set(buildBountyAllocationTargets(personalSpaceId, personId).map(uuidToHex));
    const ownInterestRows = filterOwnInterestRows(interest, {
      identityIds: targets,
      personalSpaceId,
      bountySpaceId: bounty?.spaceId ?? null,
    });
    const isAllocated = !!bounty && bounty.allocatedIds.some(id => targets.has(uuidToHex(id)));
    const isMaintainer = !!bounty && bounty.maintainers.some(m => targets.has(uuidToHex(m.id)));

    return {
      personId,
      personalSpaceId,
      isSignedIn: !!address,
      isEditor: access.isEditor,
      isMaintainer,
      isAllocated,
      isInterested: ownInterestRows.length > 0,
      ownInterestRows,
      isLoading: isLoadingAccount || isLoadingProfile || isLoadingSpace || access.isLoading,
    };
  }, [
    access.isEditor,
    access.isLoading,
    address,
    bounty,
    interest,
    isLoadingAccount,
    isLoadingProfile,
    isLoadingSpace,
    personalSpaceId,
    profile,
  ]);
}
