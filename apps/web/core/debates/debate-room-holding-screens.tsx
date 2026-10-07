'use client';

import * as React from 'react';

import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import { useFocusTrap } from './matchmaking/use-focus-trap';
import { useScrollLock } from './use-scroll-lock';

/** In-page loading card. Shared with the room's route `loading.tsx` so both render identically. */
export function DebateRoomLoadingState() {
  return (
    <div className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center px-5 py-8" role="status">
      <div className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white px-5 py-4 shadow-light">
        <Spinner />
        <Text color="grey-04">Opening your debate room…</Text>
      </div>
    </div>
  );
}

/**
 * Full-screen placeholder for the gaps between the room's full-screen views. Modal like the intro
 * and recording screens it sits between: it holds their scroll lock so the page does not unlock
 * across the swap, and traps focus, which `aria-modal` claims but does not do on its own. Only the
 * top dialog may trap, so `trapFocus` is false while a dialog sits above this one.
 */
export function DebateRoomHoldingScreen({
  label,
  claim,
  trapFocus = true,
}: {
  label: string;
  claim?: string;
  trapFocus?: boolean;
}) {
  const dialogRef = useFocusTrap(trapFocus);
  useScrollLock();

  return (
    <div
      ref={dialogRef as React.RefObject<HTMLDivElement>}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[1000] overflow-y-auto bg-white text-text outline-none"
    >
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-5 py-8 text-center">
        {claim && <h1 className="max-w-[390px] text-[1.375rem] leading-[1.1] font-semibold text-text">{claim}</h1>}
        {/* Outside the claim so the announcement is what the room is doing, not what the debate is about. */}
        <div role="status" className="flex flex-col items-center gap-3">
          <Spinner />
          <Text color="grey-04">{label}</Text>
        </div>
      </main>
    </div>
  );
}

/**
 * GEO-3149. Shown by a tab that would have followed the viewer into a debate room, when another of
 * their tabs got there first. It never moves on its own — the viewer is most likely in front of the
 * other tab — but "Open it here" walks this tab in, and the room hands the connection over to the
 * tab the viewer is looking at.
 */
export function DebateOpenElsewhereScreen({
  claim,
  onOpenHere,
  onGoBack,
}: {
  claim?: string;
  onOpenHere: () => void;
  onGoBack: () => void;
}) {
  const dialogRef = useFocusTrap(true);
  useScrollLock();

  return (
    <div
      ref={dialogRef as React.RefObject<HTMLDivElement>}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Your debate is open in another tab"
      data-testid="debate-open-elsewhere"
      className="fixed inset-0 z-[1000] overflow-y-auto bg-white text-text outline-none"
    >
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-5 py-8 text-center">
        {claim && <h1 className="max-w-[390px] text-[1.375rem] leading-[1.1] font-semibold text-text">{claim}</h1>}
        <div className="flex flex-col items-center gap-2">
          <Text as="p" variant="bodySemibold" color="text">
            Your debate is open in another tab.
          </Text>
          <Text as="p" variant="metadata" color="grey-04">
            Carry on there, or open it here instead.
          </Text>
        </div>
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onOpenHere}
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-text px-5 text-button text-white hover:bg-text/90"
          >
            Open it here
          </button>
          <button
            type="button"
            onClick={onGoBack}
            className="text-ctaPrimary transition-colors hover:text-ctaHover focus-visible:text-ctaHover"
          >
            <Text as="span" variant="textLinkSemibold" color="current">
              Go back
            </Text>
          </button>
        </div>
      </main>
    </div>
  );
}
