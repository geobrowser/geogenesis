'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { capture } from '~/core/analytics';
import { usePrivy } from '~/core/wallet/auth-hooks';

import { type GetPrivyIdentityToken, getGeoChatSession, refreshGeoChatSessionProfile } from './api';
import {
  type GeoChatAccountStatus,
  REFUSED_RETRY_MAX_MS,
  getGeoChatAccountStatus,
  refusedRetryDelayMs,
  subscribeGeoChatAccountStatus,
} from './geo-chat-account-status';
import { useGeoChatAuth } from './hooks';

const PROFILE_REFRESH_MIN_MS = 1_000;

/** The signed-in account's geo-chat session status. */
export function useGeoChatAccountStatus(accountKey: string | null): GeoChatAccountStatus {
  return React.useSyncExternalStore(
    subscribeGeoChatAccountStatus,
    () => getGeoChatAccountStatus(accountKey),
    () => getGeoChatAccountStatus(null)
  );
}

/**
 * Keeps a new account's debates surfaces recovering on their own. Mounted once, beside the gateway.
 *
 * - Refused: retries the session exchange (2 s doubling to 30 s, visible tab only) for as long as it
 *   takes. Reads stop retrying a refusal themselves; the recovery refetches them.
 * - Accepted with a pending or missing profile: refreshes on `retry_after_ms` until it attaches.
 * - On recovery or attach, refetches every geo-chat read; on `missing`, re-reads the personal space
 *   so onboarding can reopen and publish the profile.
 */
export function useGeoChatAccountRecovery() {
  const { ready, authenticated, accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const { user } = usePrivy();
  const queryClient = useQueryClient();
  const activeKey = ready && authenticated ? accountKey : null;
  const status = useGeoChatAccountStatus(activeKey);

  const signedUpAt = user?.createdAt ? new Date(user.createdAt).getTime() : null;
  useAccountStatusTransitions(activeKey, status, queryClient, signedUpAt);

  React.useEffect(() => {
    if (!activeKey) return;
    if (status.kind === 'refused') return retryWhileRefused(activeKey, getPrivyIdentityToken);
    if (status.kind === 'accepted' && status.profile !== 'attached') {
      return refreshWhilePending(activeKey, status.retryAfterMs);
    }
  }, [activeKey, getPrivyIdentityToken, status]);
}

type Cancel = () => void;

/** Runs `step` after `delayMs`, waiting for the tab to be visible first. */
function scheduleVisible(delayMs: number, step: () => void, register: (cancel: Cancel) => void) {
  const timer = setTimeout(() => {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
      step();
      return;
    }
    const onVisible = () => {
      if (document.visibilityState === 'hidden') return;
      document.removeEventListener('visibilitychange', onVisible);
      step();
    };
    document.addEventListener('visibilitychange', onVisible);
    register(() => document.removeEventListener('visibilitychange', onVisible));
  }, delayMs);
  register(() => clearTimeout(timer));
}

function retryWhileRefused(accountKey: string, getPrivyIdentityToken: GetPrivyIdentityToken): Cancel {
  let cancelled = false;
  let cancelPending: Cancel = () => undefined;
  const register = (cancel: Cancel) => {
    cancelPending = cancel;
  };

  const attempt = (n: number) => {
    scheduleVisible(
      refusedRetryDelayMs(n),
      () => {
        void getGeoChatSession(getPrivyIdentityToken, accountKey)
          .catch(() => undefined)
          .then(() => {
            // Success changes the status, which re-runs the effect and cancels this loop.
            if (!cancelled && getGeoChatAccountStatus(accountKey).kind === 'refused') attempt(n + 1);
          });
      },
      register
    );
  };
  attempt(0);

  return () => {
    cancelled = true;
    cancelPending();
  };
}

function refreshWhilePending(accountKey: string, retryAfterMs: number | null): Cancel {
  let cancelled = false;
  let cancelPending: Cancel = () => undefined;
  const register = (cancel: Cancel) => {
    cancelPending = cancel;
  };
  const delay = Math.max(retryAfterMs ?? REFUSED_RETRY_MAX_MS, PROFILE_REFRESH_MIN_MS);

  const attempt = () => {
    scheduleVisible(
      delay,
      () => {
        void refreshGeoChatSessionProfile(accountKey).then(() => {
          const next = getGeoChatAccountStatus(accountKey);
          // Unchanged status does not re-run the effect, so keep going from here.
          if (!cancelled && next.kind === 'accepted' && next.profile !== 'attached') attempt();
        });
      },
      register
    );
  };
  attempt();

  return () => {
    cancelled = true;
    cancelPending();
  };
}

/**
 * Refetches and analytics on each change of status. Analytics use `onboarding_step_viewed` with
 * `flow: 'debates_account'`, at most once per step per account per page load, so a daily query can
 * count how long new accounts wait to be accepted and for their profile to attach.
 */
function useAccountStatusTransitions(
  accountKey: string | null,
  status: GeoChatAccountStatus,
  queryClient: QueryClient,
  signedUpAt: number | null
) {
  const previousRef = React.useRef<{ accountKey: string | null; status: GeoChatAccountStatus } | null>(null);
  const firstRefusalAtRef = React.useRef<number | null>(null);
  const reportedRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    const previous = previousRef.current?.accountKey === accountKey ? previousRef.current.status : null;
    previousRef.current = { accountKey, status };
    if (previous === null) {
      firstRefusalAtRef.current = null;
      reportedRef.current = new Set();
    }
    if (!accountKey) return;

    const now = Date.now();
    const report = (step: string, properties: Record<string, unknown>) => {
      if (reportedRef.current.has(step)) return;
      reportedRef.current.add(step);
      try {
        capture('onboarding_step_viewed', {
          flow: 'debates_account',
          step_id: step,
          ms_since_sign_up: signedUpAt === null ? null : now - signedUpAt,
          ...properties,
        });
      } catch {
        // Analytics never affects the product.
      }
    };

    if (status.kind === 'refused') {
      firstRefusalAtRef.current ??= now;
      report('session_refused', { refusal_reason: status.reason, refusal_code: status.code });
      return;
    }
    if (status.kind !== 'accepted') return;

    const pendingMs = status.pendingSince ? now - Date.parse(status.pendingSince) : null;
    if (previous?.kind === 'refused') {
      void queryClient.invalidateQueries({ queryKey: ['debates'] });
    }
    if (previous?.kind === 'refused' || status.profile !== 'attached') {
      report('session_accepted', {
        profile_state: status.profile,
        refused_ms: firstRefusalAtRef.current === null ? null : now - firstRefusalAtRef.current,
        refusal_code: previous?.kind === 'refused' ? previous.code : null,
        pending_ms: pendingMs,
      });
    }
    if (status.profile === 'missing') {
      void queryClient.invalidateQueries({ queryKey: ['personal-space-id'] });
      report('profile_missing', { pending_ms: pendingMs });
    }
    if (status.profile === 'attached' && previous?.kind === 'accepted' && previous.profile !== 'attached') {
      void queryClient.invalidateQueries({ queryKey: ['debates'] });
      report('profile_attached', {
        previous_profile_state: previous.profile,
        pending_ms: previous.pendingSince ? now - Date.parse(previous.pendingSince) : null,
      });
    }
  }, [accountKey, queryClient, signedUpAt, status]);
}
