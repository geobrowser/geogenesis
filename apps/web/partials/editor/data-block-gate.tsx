'use client';

import * as React from 'react';

const EAGER_BLOCK_COUNT = 1;
const DEFERRED_TIMEOUT_MS = 5_000;

type DataBlockGateState = {
  register: (blockId: string) => number;
  markFetched: (blockId: string) => void;
  isDeferredPassReady: boolean;
};

const DataBlockGateContext = React.createContext<DataBlockGateState | null>(null);

/**
 * Two-pass data block rendering. The first EAGER_BLOCK_COUNT data blocks mount
 * immediately. The rest wait until the eager batch reports isFetched or a
 * safety timeout fires.
 */
export function DataBlockGateProvider({ children }: { children: React.ReactNode }) {
  const registeredRef = React.useRef<string[]>([]);
  const [fetchedSet, setFetchedSet] = React.useState<Set<string>>(() => new Set());
  const [timedOut, setTimedOut] = React.useState(false);

  React.useEffect(() => {
    const handle = setTimeout(() => setTimedOut(true), DEFERRED_TIMEOUT_MS);
    return () => clearTimeout(handle);
  }, []);

  const register = React.useCallback((blockId: string) => {
    const list = registeredRef.current;
    let idx = list.indexOf(blockId);
    if (idx === -1) {
      idx = list.length;
      list.push(blockId);
    }
    return idx;
  }, []);

  const markFetched = React.useCallback((blockId: string) => {
    setFetchedSet(prev => {
      if (prev.has(blockId)) return prev;
      const next = new Set(prev);
      next.add(blockId);
      return next;
    });
  }, []);

  const eagerBlockIds = registeredRef.current.slice(0, EAGER_BLOCK_COUNT);
  const allEagerFetched = eagerBlockIds.length > 0 && eagerBlockIds.every(id => fetchedSet.has(id));
  const isDeferredPassReady = timedOut || allEagerFetched;

  const value = React.useMemo<DataBlockGateState>(
    () => ({ register, markFetched, isDeferredPassReady }),
    [register, markFetched, isDeferredPassReady]
  );

  return <DataBlockGateContext.Provider value={value}>{children}</DataBlockGateContext.Provider>;
}

export function useDataBlockGate(blockId: string) {
  const gate = React.useContext(DataBlockGateContext);
  if (!gate) return { shouldRender: true, markFetched: () => {} };

  const index = gate.register(blockId);
  const isEager = index < EAGER_BLOCK_COUNT;
  const shouldRender = isEager || gate.isDeferredPassReady;

  return { shouldRender, markFetched: gate.markFetched };
}
