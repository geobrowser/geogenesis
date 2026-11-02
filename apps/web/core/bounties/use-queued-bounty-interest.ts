'use client';

import { useQueuedAction } from '~/core/state/pending-actions';

/**
 * "I'm interested" pressed before the account can publish it — signed out, or signed in with the
 * personal space still being made — held in the app-level queue until it can.
 *
 * Both bounty surfaces (the bounty page's card, the community tab's board) share one action id per
 * bounty, so either can draw it as registered and either can publish it. `liveOnly`: their write
 * reads the personal space from the render, which the press's closure predates, so it always goes
 * through a card on screen — and with none mounted when the account is ready, it waits for one.
 */
export function useQueuedBountyInterest(
  bountyId: string,
  {
    ready,
    alreadyInterested,
    eligible,
    register,
  }: {
    /**
     * Whether `alreadyInterested` and `eligible` are answers yet. Right after sign-in the viewer's
     * interest is still loading and reads as "not interested", which would publish a duplicate.
     */
    ready: boolean;
    /** Interested or allocated already — a returning viewer who signed in to press it again. */
    alreadyInterested: boolean;
    /**
     * Whether the bounty still takes interest. Sign-up can take minutes, and a bounty can end or fill
     * in that time; the press is then dropped rather than published against a closed bounty.
     */
    eligible: boolean;
    /** Records interest; resolves whether it was recorded. */
    register: () => Promise<boolean>;
  }
) {
  const { isQueued, queue, cancel } = useQueuedAction({
    id: `bounty-interest:${bountyId}`,
    component: 'bounty_interest',
    label: 'your interest in this bounty',
    liveOnly: true,
    ready,
    run: async () => {
      // Both settle it without a write: what the press asked for is already true, or no longer can be.
      if (alreadyInterested || !eligible) return;
      // The runner drops an action whose run resolves, so a write that did not happen has to throw.
      if (!(await register())) throw new Error('Your interest could not be recorded yet.');
    },
  });

  return { queued: isQueued, queue: () => queue(), cancel };
}
