'use client';

import * as React from 'react';

import type { BountyDetail } from '~/core/bounties/fetch-bounty-detail';
import { useBountyInterestActions } from '~/core/bounties/use-bounty-actions';
import type { BountyRoles } from '~/core/bounties/use-bounty-roles';

import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

import { isBountyEnded } from './bounty-board-card';

export type InterestCardState =
  'signed-out' | 'no-personal-space' | 'ended' | 'allocated' | 'spots-filled' | 'interested' | 'can-apply';

/** The curator CTA state machine, in priority order (curator-app's assign-card). */
export function resolveInterestCardState(
  detail: Pick<BountyDetail, 'bounty'>,
  roles: Pick<BountyRoles, 'isSignedIn' | 'personalSpaceId' | 'isAllocated' | 'isInterested'>,
  now: number = Date.now()
): InterestCardState {
  if (roles.isAllocated) return 'allocated';
  if (isBountyEnded(detail.bounty.deadline, now)) return 'ended';
  if (!roles.isSignedIn) return 'signed-out';
  if (!roles.personalSpaceId) return 'no-personal-space';
  if (roles.isInterested) return 'interested';
  const max = detail.bounty.maxContributors;
  if (max != null && detail.bounty.allocatedIds.length >= max) return 'spots-filled';
  return 'can-apply';
}

type Props = {
  detail: BountyDetail;
  roles: BountyRoles;
};

export function BountyInterestCard({ detail, roles }: Props) {
  const state = resolveInterestCardState(detail, roles);
  const actions = useBountyInterestActions(detail, roles);

  const copy: Record<InterestCardState, { title: string; body: string }> = {
    'signed-out': { title: 'Want to take on this bounty?', body: 'Sign in to express interest.' },
    'no-personal-space': {
      title: 'Want to take on this bounty?',
      body: 'Finish setting up your personal space, then come back to apply.',
    },
    ended: { title: 'This bounty has ended', body: 'The submission deadline has passed.' },
    allocated: { title: 'Bounty assigned to you', body: 'Submit proposals in this space and link them to the bounty.' },
    'spots-filled': { title: 'All allocated spots are filled', body: 'Check back if a spot opens up.' },
    interested: {
      title: 'Application in review',
      body: 'A space editor will allocate curators from the interested list.',
    },
    'can-apply': { title: 'Want to take on this bounty?', body: 'Express interest and an editor can allocate you.' },
  };

  return (
    <section
      aria-label="Apply for this bounty"
      data-testid="bounty-interest-card"
      data-state={state}
      className="flex flex-col gap-3 rounded-lg border border-grey-02 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-0.5">
        <Text variant="smallTitle">{copy[state].title}</Text>
        <Text variant="metadata" color="grey-04">
          {actions.error ?? copy[state].body}
        </Text>
      </div>
      {state === 'can-apply' ? (
        <Button
          variant="primary"
          disabled={actions.pending || roles.isLoading}
          onClick={() => void actions.expressInterest()}
        >
          {actions.pending ? 'Saving…' : "I'm interested"}
        </Button>
      ) : state === 'interested' ? (
        <Button variant="secondary" disabled={actions.pending} onClick={() => void actions.cancelInterest()}>
          {actions.pending ? 'Saving…' : 'Cancel interest'}
        </Button>
      ) : null}
    </section>
  );
}
