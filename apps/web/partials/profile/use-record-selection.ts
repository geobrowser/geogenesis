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
  /**
   * Replace the whole selection.
   *
   * For reconciling against a menu that has moved: a topic the current filter
   * has made unreachable is gone from the list that offered it, so holding it
   * would leave the reader filtered by a chip they cannot see to un-pick.
   */
  replace: (next: (current: string[]) => string[]) => void;
};

export function useRecordSelection(initial: string[] = []): RecordSelection {
  const [values, setValues] = React.useState<string[]>(initial);

  const toggle = React.useCallback((value: string) => {
    setValues(current => (current.includes(value) ? current.filter(entry => entry !== value) : [...current, value]));
  }, []);

  const clear = React.useCallback(() => setValues([]), []);

  const replace = React.useCallback((next: (current: string[]) => string[]) => {
    // Identity-stable when nothing changed, so an effect reconciling against its
    // own output does not loop.
    setValues(current => {
      const updated = next(current);
      return updated.length === current.length && updated.every((id, i) => id === current[i]) ? current : updated;
    });
  }, []);

  return { values, toggle, clear, replace };
}
