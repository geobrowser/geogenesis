'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

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
          setActions(prev => prev.filter(a => a.id !== action.id));
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
