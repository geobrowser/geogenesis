import * as React from 'react';

type Entry = {
  placeholder?: boolean;
  entityId: string;
};

export function usePlaceholderAutofocus(entries: Entry[]): boolean {
  const lastPlaceholderIdRef = React.useRef<string | null>(null);
  const [shouldAutoFocus, setShouldAutoFocus] = React.useState(false);

  // Track when a new placeholder is added
  React.useEffect(() => {
    const placeholderRow = entries.find(e => e.placeholder);
    if (placeholderRow) {
      const placeholderId = placeholderRow.entityId;
      if (lastPlaceholderIdRef.current !== placeholderId) {
        // New placeholder detected
        lastPlaceholderIdRef.current = placeholderId;
        setShouldAutoFocus(true);
      }
    } else {
      // No placeholder present, reset
      lastPlaceholderIdRef.current = null;
      setShouldAutoFocus(false);
    }
  }, [entries]);

  return shouldAutoFocus;
}
