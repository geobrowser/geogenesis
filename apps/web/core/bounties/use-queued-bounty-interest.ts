'use client';

import * as React from 'react';

import {
  useDequeuePendingAction,
  useEnqueuePendingAction,
  useLivePendingActionHandler,
  usePendingActionIntent,
} from '~/core/state/pending-actions';

/**
 * "I'm interested" pressed before the account can publish it — signed out, or signed in with the
 * personal space still being made — held in the app-level queue until it can.
 *
 * Both bounty surfaces (the bounty page's card, the community tab's board) share one action id per
 * bounty, so either can draw it as registered and either can publish it. The publish goes through
 * whichever is mounted when the space is ready: their write reads the personal space from the
 * render, which the press's closure predates. With neither on screen the runner reports it and
 * offers a retry, rather than dropping it as done.
 */
export function useQueuedBountyInterest(bountyId: string, register: () => Promise<boolean>) {
  const id = `bounty-interest:${bountyId}`;
  const enqueuePendingAction = useEnqueuePendingAction('bounty_interest');
  const dequeuePendingAction = useDequeuePendingAction();
  const queued = usePendingActionIntent(id) !== undefined;

  useLivePendingActionHandler(id, async () => {
    if (!(await register())) throw new Error('Your interest could not be recorded yet.');
  });

  const queue = React.useCallback(
    () =>
      enqueuePendingAction({
        id,
        label: 'your interest in this bounty',
        requires: 'personalSpace',
        intent: 'interested',
        run: () => {
          throw new Error('Open the bounty again to finish registering your interest.');
        },
      }),
    [enqueuePendingAction, id]
  );

  const cancel = React.useCallback(() => dequeuePendingAction(id), [dequeuePendingAction, id]);

  return { queued, queue, cancel };
}
