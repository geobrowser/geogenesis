'use client';

import * as React from 'react';

type Entry = {
  placeholder?: boolean;
  entityId: string;
};

/**
 * @param entriesKey Stable string identity for the row list (entity ids + placeholder flags).
 * @param entries Row list used to resolve the placeholder entity id (read via ref in the effect).
 */
export function usePlaceholderAutofocus(entriesKey: string, entries: Entry[]): boolean {
  const lastPlaceholderIdRef = React.useRef<string | null>(null);
  const [shouldAutoFocus, setShouldAutoFocus] = React.useState(false);
  const entriesRef = React.useRef(entries);
  entriesRef.current = entries;

  React.useEffect(() => {
    const placeholderEntityId = entriesRef.current.find(e => e.placeholder)?.entityId ?? null;

    if (placeholderEntityId) {
      if (lastPlaceholderIdRef.current !== placeholderEntityId) {
        lastPlaceholderIdRef.current = placeholderEntityId;
        setShouldAutoFocus(true);
      }
    } else if (lastPlaceholderIdRef.current !== null) {
      lastPlaceholderIdRef.current = null;
      setShouldAutoFocus(false);
    }
  }, [entriesKey]);

  return shouldAutoFocus;
}
