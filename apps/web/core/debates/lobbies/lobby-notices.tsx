'use client';

import type * as React from 'react';

import type { DebateLobbyMember } from '../api';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { personName } from './lobby-format';

export type LobbyGuestNotice = { message: string; retry: string | null };

/**
 * The lobby's toasts, stacked above the bottom bar so they show on either phone tab and never push
 * the page. `noticesRef` is the slot deeper parts (the away warning) draw into.
 */
export function LobbyNotices({
  noticesRef,
  handoff,
  queuedOutcome,
  onDismissQueuedOutcome,
  moderationNotice,
  guestNotice,
  guestConnecting,
  onGuestRetry,
}: {
  noticesRef: (element: HTMLElement | null) => void;
  /** Who hosts now, for a few seconds after a handoff. */
  handoff: DebateLobbyMember | null;
  queuedOutcome: string | null;
  onDismissQueuedOutcome: () => void;
  moderationNotice: string | null;
  guestNotice: LobbyGuestNotice | null;
  guestConnecting: boolean;
  /** `null` once signed in, when listening again as a guest no longer applies. */
  onGuestRetry: (() => void) | null;
}) {
  return (
    <div ref={noticesRef} className="contents">
      {handoff ? <LobbyToast>{personName(handoff)} is hosting now</LobbyToast> : null}
      {queuedOutcome ? (
        <LobbyToast
          action={
            <HubPillButton
              analyticsLabel="Lobby queued request dismiss"
              onClick={onDismissQueuedOutcome}
              className="border-white bg-white"
            >
              OK
            </HubPillButton>
          }
        >
          {queuedOutcome}
        </LobbyToast>
      ) : null}
      {moderationNotice ? <LobbyToast>{moderationNotice}</LobbyToast> : null}
      {guestNotice ? (
        <LobbyToast
          action={
            guestNotice.retry && onGuestRetry ? (
              <HubPillButton
                analyticsLabel="Lobby guest retry listen"
                onClick={onGuestRetry}
                className="border-white bg-white"
              >
                {guestNotice.retry}
              </HubPillButton>
            ) : null
          }
        >
          {guestNotice.message}
        </LobbyToast>
      ) : guestConnecting ? (
        <LobbyToast>Connecting voice…</LobbyToast>
      ) : null}
    </div>
  );
}

/** A notice over the page, above the bottom bar, so it never pushes the room down. */
export function LobbyToast({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-auto flex max-w-[min(560px,100%)] items-center gap-2.5 rounded-xl bg-text px-3.5 py-2.5 text-metadata text-white shadow-lg"
    >
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}
