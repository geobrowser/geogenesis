'use client';

import * as React from 'react';

import { Text } from '~/design-system/text';

import { useFocusTrap } from './matchmaking/use-focus-trap';
import { useScrollLock } from './use-scroll-lock';

/**
 * The frame the debate dialogs share: a dimmed, blurred overlay and a 370px card with a centred
 * header (an eyebrow over the claim), a scrolling body and a footer.
 *
 * Pulled out of `DebateRequestDialog` so the claim page's "now or later?" popup (GEO-3244) is the
 * same frame rather than a copy of its classes. The classes are the request dialog's, unchanged.
 *
 * `onClose` is opt-in: given one, Escape and a press on the backdrop call it and focus is held in
 * the card. The request dialogs leave it out — they answer a request, and closing one by a stray
 * click would read as having declined it.
 */
export function DebateDialogShell({
  eyebrow,
  title,
  headerStart,
  headerEnd,
  footer,
  onClose,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Pinned to the header's left: a Back control. */
  headerStart?: React.ReactNode;
  /** Pinned to the header's right: a close control. */
  headerEnd?: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const titleId = React.useId();
  const trapRef = useFocusTrap(Boolean(onClose));
  useScrollLock();

  React.useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="max-sm:items-end max-sm:p-0 fixed inset-0 z-1200 flex items-center justify-center bg-text/45 p-5 backdrop-blur-sm"
      onClick={onClose ? event => event.target === event.currentTarget && onClose() : undefined}
    >
      <section
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-sm:max-h-[calc(100dvh-1rem)] max-sm:rounded-b-none max-sm:border-b-0 max-sm:px-4 max-sm:py-5 grid max-h-[calc(100dvh-2rem)] w-[min(370px,100%)] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden rounded-lg bg-bg p-5 text-text shadow-card focus:outline-hidden"
      >
        <header className="relative min-w-0 text-center">
          {headerStart ? <div className="absolute top-0 left-0">{headerStart}</div> : null}
          {headerEnd ? <div className="absolute top-0 right-0">{headerEnd}</div> : null}
          {eyebrow ?? (
            <Text as="div" variant="metadata" color="text">
              Debate request
            </Text>
          )}
          <h2 id={titleId} className="mt-3 text-cardEntityTitle leading-[1.375rem]">
            {title}
          </h2>
        </header>
        <div className="min-h-0 overflow-y-auto pr-1">{children}</div>
        {footer ? <footer className="grid gap-5">{footer}</footer> : <div />}
      </section>
    </div>
  );
}
