'use client';

import * as React from 'react';

import type { BountyDetail } from '~/core/bounties/fetch-bounty-detail';
import { isBountyEnded } from '~/core/bounties/payout';
import { useBountyInterestActions } from '~/core/bounties/use-bounty-actions';
import type { BountyRoles } from '~/core/bounties/use-bounty-roles';
import { useQueuedBountyInterest } from '~/core/bounties/use-queued-bounty-interest';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { uuidToHex } from '~/core/id/normalize';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';

import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

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
  // Dedupe targets: duplicate allocation rows (or one curator allocated under
  // both identity shapes) must not fill spots twice.
  if (max != null && new Set(detail.bounty.allocatedIds.map(uuidToHex)).size >= max) return 'spots-filled';
  return 'can-apply';
}

type Props = {
  detail: BountyDetail;
  roles: BountyRoles;
};

export function BountyInterestCard({ detail, roles }: Props) {
  const state = resolveInterestCardState(detail, roles);
  const actions = useBountyInterestActions(detail, roles);
  const openPrivySignIn = usePrivySignIn(undefined, {
    analytics: {
      component: 'bounty_interest',
      target_id: detail.bounty.id,
      target_type: 'bounty',
      auth_control: 'express_interest',
      auth_intent: 'bounty_interest',
      auth_continuation: 'queued',
    },
  });
  // Pressed before the account could publish it: queued, and drawn as applied, until it can.
  const queuedInterest = useQueuedBountyInterest(detail.bounty.id, {
    ready: !roles.isLoading && Boolean(roles.personalSpaceId),
    alreadyInterested: roles.isInterested || roles.isAllocated,
    eligible: state === 'can-apply',
    register: actions.expressInterest,
  });
  const queueInterest = () => {
    queuedInterest.queue();
    // A dismissed sign-in withdraws it, so walking away never registers interest later.
    if (state === 'signed-out') openPrivySignIn(undefined, { onCancel: queuedInterest.cancel });
  };
  // Without a space, only while one is being made — with no setup under way, nothing would publish it.
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();
  const canQueue = state === 'signed-out' || (state === 'no-personal-space' && isAccountSetupPending);
  const showQueued = queuedInterest.queued && canQueue;

  const copy: Record<InterestCardState, { title: string; body: string }> = {
    'signed-out': { title: 'Want to take on this bounty?', body: 'Express interest and an editor can allocate you.' },
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
      className="flex flex-row items-center justify-between gap-3 rounded-lg border border-grey-02 bg-white p-4 mobile:flex-col mobile:items-stretch mobile:justify-start"
    >
      <div className="flex flex-col gap-0.5">
        <Text variant="smallTitle">{showQueued ? 'Interest saved' : copy[state].title}</Text>
        <Text variant="metadata" color="grey-04">
          {actions.error ??
            (showQueued ? 'It will be sent to the editors as soon as your account is ready.' : copy[state].body)}
        </Text>
      </div>
      {showQueued ? (
        <Button variant="secondary" onClick={queuedInterest.cancel}>
          Cancel interest
        </Button>
      ) : canQueue ? (
        // Same affordance as upvote/downvote: the button is always there. Signed out it opens Privy;
        // either way the interest is kept and sent once the account is ready.
        <Button variant="primary" onClick={queueInterest}>
          I&apos;m interested
        </Button>
      ) : state === 'can-apply' ? (
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
