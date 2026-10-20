'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { useOnSignOut } from '~/core/hooks/use-on-sign-out';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { pendingActionsAtom } from '~/core/state/pending-actions';
import { useReportError } from '~/core/state/status-bar-store';
import { describeError } from '~/core/utils/error-diagnostics';

/**
 * Replays actions the user took before their account was ready (see
 * `pendingActionsAtom`).
 */
export function PendingActionsRunner() {
  const [actions, setActions] = useAtom(pendingActionsAtom);
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const reportError = useReportError();

  // Signing out — here, in another tab, or by session expiry — drops whatever is queued. A logout in
  // this tab reloads the page and takes the queue with it, but the other two leave this tab running:
  // a queued action would otherwise wait for the next account to sign in here and publish as them.
  // Privy's `authenticated`, not the smart account, which reads null for a moment mid-sign-up.
  useOnSignOut(() => setActions([]));

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
