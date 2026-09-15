import * as React from 'react';

import equal from 'fast-deep-equal';

import type { ModesByColumn } from './filters';

/**
 * Keeps mode controls responsive while the FILTER value propagates through
 * the local store. This is also needed while a new property's filter values
 * are still drafts: the serializer intentionally omits modes for properties
 * that have not been committed yet.
 */
export function useOptimisticFilterModes(persistedModesByColumn: ModesByColumn) {
  const [optimisticModesByColumn, setOptimisticModesByColumnState] = React.useState<ModesByColumn | null>(null);
  const modesByColumn = optimisticModesByColumn ?? persistedModesByColumn;
  const modesByColumnRef = React.useRef(modesByColumn);

  React.useEffect(() => {
    modesByColumnRef.current = modesByColumn;
  }, [modesByColumn]);

  React.useEffect(() => {
    if (optimisticModesByColumn !== null && equal(optimisticModesByColumn, persistedModesByColumn)) {
      setOptimisticModesByColumnState(null);
    }
  }, [optimisticModesByColumn, persistedModesByColumn]);

  const setOptimisticModesByColumn = React.useCallback((nextModes: ModesByColumn) => {
    modesByColumnRef.current = nextModes;
    setOptimisticModesByColumnState(nextModes);
  }, []);

  return { modesByColumn, modesByColumnRef, setOptimisticModesByColumn };
}
