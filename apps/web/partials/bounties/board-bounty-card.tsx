'use client';

import * as React from 'react';

import { toSpaceBounty } from '~/core/bounties/community-adapter';
import { statusKeyForId } from '~/core/bounties/labels';
import type { BoardBounty } from '~/core/bounties/types';
import type { SpaceBounty } from '~/core/community/bounty-types';

import { AvailableBountyCard, BountyCard, InProgressBountyCard } from '~/partials/community-tab/bounty-card';

import { BOARD_CARD_HEIGHT_PX } from './board-layout';

// Declared in `board-layout.ts`, which carries no `'use client'`, because `app/bounties/loading.tsx`
// renders the skeleton on the server and puts the grid class into a `className`. Re-exported here so
// every existing importer keeps working.
export { BOARD_CARD_HEIGHT_PX, BOARD_GRID_CLASS } from './board-layout';

/**
 * The interest bindings an available card needs, lifted to the grid so one
 * query covers every visible bounty (see `useInterestedBountyIds`).
 */
export type BoardInterestBindings = {
  interestedIds: ReadonlySet<string>;
  isInterestLoading: boolean;
  canRegisterInterest: boolean;
  pendingBountyId: string | null;
  onRegisterInterest: (bounty: SpaceBounty) => void;
};

/**
 * The board renders the Community tab's card designs, chosen by workflow
 * status the same way the tab's sections are split: Done (and Cancelled) get
 * the completed card, In progress / In review the in-progress card, and
 * Backlog / To do the available card with "I'm interested".
 */
export function BoardBountyCard({ bounty, interest }: { bounty: BoardBounty; interest: BoardInterestBindings }) {
  const spaceBounty = toSpaceBounty(bounty);
  switch (statusKeyForId(bounty.statusId)) {
    case 'done':
    case 'cancelled':
      return <BountyCard bounty={spaceBounty} height={BOARD_CARD_HEIGHT_PX} />;
    case 'in-progress':
    case 'in-review':
      return <InProgressBountyCard bounty={spaceBounty} height={BOARD_CARD_HEIGHT_PX} />;
    case 'backlog':
    case 'todo':
      return (
        <AvailableBountyCard
          bounty={spaceBounty}
          height={BOARD_CARD_HEIGHT_PX}
          isInterested={interest.interestedIds.has(bounty.id)}
          isPending={interest.pendingBountyId === bounty.id}
          isInterestLoading={interest.isInterestLoading}
          canRegisterInterest={interest.canRegisterInterest}
          onRegisterInterest={interest.onRegisterInterest}
        />
      );
  }
}
