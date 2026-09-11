'use client';

import { atom } from 'jotai';

import type { ClaimDraftSelection } from '~/core/claims/claim-draft';

export type PendingDebateClaimStatus = 'publishing' | 'indexed';

/**
 * A claim the viewer just created inline from a debates surface, held in memory until it is indexed.
 */
export type PendingDebateClaim = {
  claimId: string;
  spaceId: string;
  text: string;
  topics: ClaimDraftSelection[];
  status: PendingDebateClaimStatus;
};

export const pendingDebateClaimsAtom = atom<PendingDebateClaim[]>([]);
