'use client';

import * as React from 'react';

/**
 * Holds the page still while a dialog is open.
 *
 * Refcounted on purpose. Every dialog used to save and restore `overflow` itself, which is correct
 * only while their lifetimes nest cleanly — and they don't: accepting a request navigates to the
 * debate room, so the room's pre-screen mounts (saving `hidden`) before the request popup unmounts
 * (restoring `''`). Whichever locked second then restored `hidden` on the way out and nothing on
 * the page scrolled again until a reload.
 */
let locks = 0;
let restore: (() => void) | null = null;

function acquire() {
  locks += 1;
  if (locks > 1) return;

  const { body, documentElement } = document;
  const previousBody = body.style.overflow;
  const previousDocument = documentElement.style.overflow;
  body.style.overflow = 'hidden';
  documentElement.style.overflow = 'hidden';
  restore = () => {
    body.style.overflow = previousBody;
    documentElement.style.overflow = previousDocument;
  };
}

function release() {
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;
  restore?.();
  restore = null;
}

export function useScrollLock() {
  React.useEffect(() => {
    acquire();
    return release;
  }, []);
}
