'use client';

import * as React from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';

import { RESPONSE_CONFIRMING_COPY } from '~/core/responses/entity-response';

const responseConfirmingTextAtom = atom<string | null>(null);

/** Blanks the text before restoring it, so a repeat of the same sentence still gets announced. */
export function useAnnounceResponseConfirmed() {
  const setText = useSetAtom(responseConfirmingTextAtom);
  return React.useCallback(() => {
    setText(null);
    requestAnimationFrame(() => setText(RESPONSE_CONFIRMING_COPY));
  }, [setText]);
}

/** Sr-only live region for response confirmations. Mounted once in `app/entry.tsx`. */
export function ResponseConfirmingAnnouncement() {
  const text = useAtomValue(responseConfirmingTextAtom);
  return (
    <span aria-live="polite" className="sr-only">
      {text}
    </span>
  );
}
