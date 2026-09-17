'use client';

import * as React from 'react';

/**
 * One multi-select dimension's state (GEO-2918).
 *
 * The three record tabs each carry one or two of these and they behave
 * identically: toggle a value, or clear the lot. Small enough that three copies
 * would not have been obviously wrong, and identical enough that they would have
 * drifted — the debates hub already carries two variants of this shape.
 */
export type RecordSelection = {
  values: string[];
  toggle: (value: string) => void;
  clear: () => void;
};

export function useRecordSelection(initial: string[] = []): RecordSelection {
  const [values, setValues] = React.useState<string[]>(initial);

  const toggle = React.useCallback((value: string) => {
    setValues(current => (current.includes(value) ? current.filter(entry => entry !== value) : [...current, value]));
  }, []);

  const clear = React.useCallback(() => setValues([]), []);

  return { values, toggle, clear };
}
