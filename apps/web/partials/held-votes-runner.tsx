'use client';

import * as React from 'react';

import { useAtom, useSetAtom, useStore } from 'jotai';

import { useAuthResolving } from '~/core/hooks/use-auth-resolving';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { castLocalVote } from '~/core/state/cast-local-vote';
import { heldVotesAtom } from '~/core/state/held-votes';
import { pendingActionsAtom } from '~/core/state/pending-actions';

/**
 * Carries out the votes pressed while sign-in was resolving (see `heldVotesAtom`), once each, when it
 * resolves.
 */
export function HeldVotesRunner() {
  const [held, setHeld] = useAtom(heldVotesAtom);
  const setActions = useSetAtom(pendingActionsAtom);
  const store = useStore();
  const authResolving = useAuthResolving();
  const { smartAccount } = useSmartAccount();
  const promptSignIn = usePrivySignIn();

  React.useLayoutEffect(() => {
    if (held.length === 0 || authResolving) return;
    setHeld([]);
    if (smartAccount) return;

    const queued = store.get(pendingActionsAtom);
    const needAccount: string[] = [];
    let lastPrompted: { vote: (typeof held)[number]; direction: string } | null = null;

    for (const vote of held) {
      const direction = queued.find(action => action.id === vote.actionId)?.intent;
      if (direction !== 'positive' && direction !== 'negative') continue;

      if (vote.responseKind === null) {
        needAccount.push(vote.actionId);
        lastPrompted = { vote, direction };
        continue;
      }

      setActions(prev => prev.filter(action => action.id !== vote.actionId));
      castLocalVote({
        entityId: vote.entityId,
        spaceId: vote.spaceId,
        responseKind: vote.responseKind,
        direction,
        title: vote.title,
        attribution: vote.attribution,
      });
    }

    if (lastPrompted) {
      const ids = new Set(needAccount);
      promptSignIn(
        {
          ...lastPrompted.vote.attribution,
          auth_control: `${lastPrompted.vote.responseKind}_${lastPrompted.direction}`,
          auth_intent: 'vote',
          auth_continuation: 'queued',
        },
        { onCancel: () => setActions(prev => prev.filter(action => !ids.has(action.id))) }
      );
    }
  }, [authResolving, held, promptSignIn, setActions, setHeld, smartAccount, store]);

  return null;
}
