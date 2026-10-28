'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import type { AnalyticsProperties } from '~/core/analytics';
import { useAuthResolving } from '~/core/hooks/use-auth-resolving';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { type PendingAction, pendingActionsAtom } from '~/core/state/pending-actions';
import { useReportError } from '~/core/state/status-bar-store';
import { describeError } from '~/core/utils/error-diagnostics';
import { usePrivy } from '~/core/wallet/auth-hooks';

/**
 * Replays actions the user took before their account was ready (see
 * `pendingActionsAtom`).
 */
export function PendingActionsRunner() {
  const [actions, setActions] = useAtom(pendingActionsAtom);
  const { smartAccount } = useSmartAccount();
  const { ready: authReady, authenticated } = usePrivy();
  const authResolving = useAuthResolving();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const promptSignIn = usePrivySignIn();
  const reportError = useReportError();

  const wasAuthenticated = React.useRef(false);

  const settled = React.useRef(new WeakSet<PendingAction>());

  // Signing out clears the queue, so a press never publishes as the next account to sign in here.
  // Resolving signed out runs each press's `onSignedOut`, with one prompt for all of them.
  React.useLayoutEffect(() => {
    if (!authReady) return;
    if (wasAuthenticated.current && !authenticated) {
      wasAuthenticated.current = false;
      setActions([]);
      return;
    }
    wasAuthenticated.current = authenticated;
    if (authResolving || smartAccount) return;

    const carried: { action: PendingAction; carryOut: () => void }[] = [];
    const prompts: { id: string; analytics: AnalyticsProperties }[] = [];
    for (const action of actions) {
      const outcome = action.onSignedOut;
      if (!outcome || settled.current.has(action)) continue;
      settled.current.add(action);
      if (typeof outcome === 'function') carried.push({ action, carryOut: outcome });
      else prompts.push({ id: action.id, analytics: outcome.prompt });
    }

    if (carried.length > 0) {
      const done = new Set(carried.map(({ action }) => action));
      setActions(prev => prev.filter(action => !done.has(action)));
      carried.forEach(({ carryOut }) => carryOut());
    }

    const last = prompts.at(-1);
    if (last) {
      const ids = new Set(prompts.map(({ id }) => id));
      promptSignIn(last.analytics, { onCancel: () => setActions(prev => prev.filter(action => !ids.has(action.id))) });
    }
  }, [actions, authReady, authResolving, authenticated, promptSignIn, setActions, smartAccount]);

  const runningRef = React.useRef<Set<string>>(new Set());
  const [retryNonce, setRetryNonce] = React.useState(0);

  const hasAuth = Boolean(smartAccount);
  const hasPersonalSpace = Boolean(smartAccount && isRegistered && personalSpaceId);

  React.useEffect(() => {
    if (actions.length === 0) return;

    for (const action of actions) {
      if (runningRef.current.has(action.id)) continue;
      const ready = action.requires === 'personalSpace' ? hasPersonalSpace : hasAuth;
      if (!ready) continue;

      runningRef.current.add(action.id);
      void (async () => {
        try {
          await action.run();
          // This instance, not every action with its id: a newer press for the same control may have
          // replaced it while it ran, and that one still has to run.
          setActions(prev => prev.filter(a => a !== action));
        } catch (error) {
          // Keep the action queued and the optimistic UI on screen
          reportError(`Couldn't save ${action.label}: ${describeError(error)}`, () => setRetryNonce(n => n + 1));
        } finally {
          runningRef.current.delete(action.id);
        }
      })();
    }
  }, [actions, hasAuth, hasPersonalSpace, retryNonce, reportError, setActions]);

  return null;
}
