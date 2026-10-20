'use client';

import * as React from 'react';

import { useAtom, useSetAtom, useStore } from 'jotai';

import { useAuthResolving } from '~/core/hooks/use-auth-resolving';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { deferredSignInAtom } from '~/core/state/deferred-sign-in';
import { pendingActionsAtom } from '~/core/state/pending-actions';

/**
 * Opens the sign-in a press deferred while sign-in was resolving (see `deferredSignInAtom`), once it
 * resolves signed out. Signed in, there is nothing to ask: `PendingActionsRunner` sends the queued
 * action. A dismissed sign-in withdraws the actions it was opened for, as it does when a control
 * prompts at the press.
 */
export function DeferredSignInRunner() {
  const [deferred, setDeferred] = useAtom(deferredSignInAtom);
  const setActions = useSetAtom(pendingActionsAtom);
  const store = useStore();
  const authResolving = useAuthResolving();
  const { smartAccount } = useSmartAccount();
  const promptSignIn = usePrivySignIn();

  React.useEffect(() => {
    if (deferred.length === 0 || authResolving) return;
    setDeferred([]);
    if (smartAccount) return;

    const queuedIds = new Set(store.get(pendingActionsAtom).map(action => action.id));
    const waiting = deferred.filter(entry => queuedIds.has(entry.actionId));
    if (waiting.length === 0) return;

    const ids = new Set(waiting.map(entry => entry.actionId));
    promptSignIn(waiting[waiting.length - 1]!.analytics, {
      onCancel: () => setActions(prev => prev.filter(action => !ids.has(action.id))),
    });
  }, [authResolving, deferred, promptSignIn, setActions, setDeferred, smartAccount, store]);

  return null;
}
