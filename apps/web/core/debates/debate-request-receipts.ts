'use client';

import * as React from 'react';

import { type DebateRequestReceiptKind, type GetPrivyIdentityToken, reportDebateRequestReceipt } from './api';

export type PendingIncomingRequest = { kind: DebateRequestReceiptKind; id: string };

/**
 * Proof a person is in front of the tab. The same events the interaction reporter counts; a tab
 * merely being visible is not proof, which is the whole of GEO-3119.
 */
const SEEN_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/**
 * Tells geo-chat how far each live request addressed to this viewer got (GEO-3119).
 *
 * - **Delivered**: this tab has the request in hand, which is when it starts alerting for it.
 * - **Seen**: real input in a visible tab while the request is pending, so a person was there.
 *   Answering it is input too, so an answered request is always seen.
 *
 * Each id is reported once per stage per tab; geo-chat keeps the first report of each, so several
 * tabs reporting the same request are harmless. Failures are swallowed: a missing receipt costs a
 * gap in the data, never the request itself.
 */
export function useDebateRequestReceipts(
  enabled: boolean,
  pending: readonly PendingIncomingRequest[],
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  const reportedRef = React.useRef(new Set<string>());
  const authRef = React.useRef({ getPrivyIdentityToken, accountKey });
  authRef.current = { getPrivyIdentityToken, accountKey };
  const pendingRef = React.useRef(pending);
  pendingRef.current = pending;

  const report = React.useCallback((request: PendingIncomingRequest, stage: 'delivered' | 'seen') => {
    const key = `${request.kind}:${request.id}:${stage}`;
    if (reportedRef.current.has(key)) return;
    reportedRef.current.add(key);
    void reportDebateRequestReceipt(
      { kind: request.kind, request_id: request.id, stage },
      authRef.current.getPrivyIdentityToken,
      authRef.current.accountKey
    ).catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    for (const request of pending) report(request, 'delivered');
  }, [enabled, pending, report]);

  const hasPending = pending.length > 0;
  React.useEffect(() => {
    if (!enabled || !hasPending || typeof window === 'undefined') return;
    const onInput = () => {
      if (document.visibilityState !== 'visible') return;
      for (const request of pendingRef.current) report(request, 'seen');
    };
    for (const eventName of SEEN_EVENTS) {
      window.addEventListener(eventName, onInput, { passive: true, capture: true });
    }
    return () => {
      for (const eventName of SEEN_EVENTS) {
        window.removeEventListener(eventName, onInput, { capture: true });
      }
    };
  }, [enabled, hasPending, report]);
}
