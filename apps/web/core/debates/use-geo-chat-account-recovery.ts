'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { useAtomValue } from 'jotai';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { devLog } from '~/core/utils/dev-log';
import { usePrivy } from '~/core/wallet/auth-hooks';

import { stepAtom } from '~/partials/onboarding/onboarding-atoms';

import { readGeoChatSessionProfile } from './api';
import { debateGateway } from './debate-gateway';
import {
  type GeoChatAccountStatus,
  REFUSED_RETRY_MAX_MS,
  getGeoChatAccountStatus,
  setLiveGeoChatAccountKey,
  subscribeGeoChatAccountStatus,
} from './geo-chat-account-status';
import { useGeoChatAuth } from './hooks';

const PROFILE_REFRESH_MIN_MS = 1_000;
/** An account this new reports its first acceptance even when it was never refused. */
const RECENT_SIGN_UP_MS = 24 * 60 * 60 * 1000;

/** `session_accepted` is reported once per account per browser, so reloads don't repeat it. */
function acceptanceReportedKey(accountKey: string) {
  return `geo:debates-session-accepted:${accountKey}`;
}

function wasAcceptanceReported(accountKey: string) {
  try {
    return window.localStorage.getItem(acceptanceReportedKey(accountKey)) !== null;
  } catch {
    return false;
  }
}

function markAcceptanceReported(accountKey: string) {
  try {
    window.localStorage.setItem(acceptanceReportedKey(accountKey), String(Date.now()));
  } catch {
    // Without storage it may repeat after a reload; the report is a nicety.
  }
}

/** The signed-in account's geo-chat session status. */
export function useGeoChatAccountStatus(accountKey: string | null): GeoChatAccountStatus {
  return React.useSyncExternalStore(
    subscribeGeoChatAccountStatus,
    () => getGeoChatAccountStatus(accountKey),
    () => getGeoChatAccountStatus(null)
  );
}

/**
 * Mounted once. The gateway retries a refused exchange; this hook reacts to the status it records. It
 * refreshes a pending profile on `retry_after_ms` and refetches the debates reads on recovery and attach.
 */
export function useGeoChatAccountRecovery() {
  const { ready, authenticated, accountKey } = useGeoChatAuth();
  const { user } = usePrivy();
  const queryClient = useQueryClient();
  const activeKey = ready && authenticated ? accountKey : null;
  const status = useGeoChatAccountStatus(activeKey);

  React.useEffect(() => {
    if (ready) setLiveGeoChatAccountKey(activeKey);
  }, [ready, activeKey]);

  const signedUpAt = user?.createdAt ? new Date(user.createdAt).getTime() : null;
  useAccountStatusTransitions(activeKey, status, queryClient, signedUpAt);

  // A refused exchange is retried by the gateway's reconnect, which can be waiting up to 30 s.
  // Finishing setup is when geo-chat starts accepting, so try the exchange at once.
  const { isRegistered } = usePersonalSpaceId();
  const onboardingCompleted = useAtomValue(stepAtom) === 'completed';
  const refused = status.kind === 'refused';
  React.useEffect(() => {
    if (activeKey && refused && (isRegistered || onboardingCompleted)) debateGateway.retryNow();
  }, [activeKey, refused, isRegistered, onboardingCompleted]);

  React.useEffect(() => {
    if (!activeKey) return;
    if (status.kind === 'accepted' && status.profile !== 'attached') {
      return pollWhilePending(activeKey, status.retryAfterMs);
    }
  }, [activeKey, status]);
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

function pollWhilePending(accountKey: string, retryAfterMs: number | null): Cancel {
  let cancelled = false;
  let cancelPending: Cancel = () => undefined;
  const register = (cancel: Cancel) => {
    cancelPending = cancel;
  };
  const delay = Math.max(retryAfterMs ?? REFUSED_RETRY_MAX_MS, PROFILE_REFRESH_MIN_MS);

  const attempt = (delayMs: number) => {
    scheduleVisible(
      delayMs,
      () => {
        void readGeoChatSessionProfile(accountKey).then(read => {
          const next = getGeoChatAccountStatus(accountKey);
          // Unchanged status does not re-run the effect, so keep going from here.
          if (cancelled || next.kind !== 'accepted' || next.profile === 'attached') return;
          attempt(read.state === null ? Math.max(delay, read.retryAfterMs ?? 0) : delay);
        });
      },
      register
    );
  };
  attempt(delay);

  return () => {
    cancelled = true;
    cancelPending();
  };
}

/** Refetches on status changes, and computes each session outcome once per step per account per load. */
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
      // Not sent until `debates_session_outcome` is registered in the analytics repo (see PR).
      devLog('[debates] session outcome %o', {
        outcome: step,
        ms_since_sign_up: signedUpAt === null ? null : now - signedUpAt,
        ...properties,
      });
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
    const recentSignUp = signedUpAt !== null && now - signedUpAt < RECENT_SIGN_UP_MS;
    if (
      (previous?.kind === 'refused' || status.profile !== 'attached' || recentSignUp) &&
      !wasAcceptanceReported(accountKey)
    ) {
      markAcceptanceReported(accountKey);
      report('session_accepted', {
        profile_state: status.profile,
        refused_ms: firstRefusalAtRef.current === null ? 0 : now - firstRefusalAtRef.current,
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
