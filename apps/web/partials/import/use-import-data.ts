'use client';

import { useAtomValue } from 'jotai';
import { useMemo } from 'react';

import { headersAtom, importRevisionAtom, importSessionIdAtom, rowCountAtom } from './atoms';
import { ImportSessionStore } from './import-session-store';

/**
 * Hook for accessing parsed CSV import data.
 *
 * Reads from ImportSessionStore (outside React) but uses importRevisionAtom
 * to correctly invalidate when data changes. Components should use this
 * instead of reaching into the store directly.
 */
export function useImportData() {
  const sessionId = useAtomValue(importSessionIdAtom);
  const revision = useAtomValue(importRevisionAtom);
  const headers = useAtomValue(headersAtom);
  const rowCount = useAtomValue(rowCountAtom);

  const rows = useMemo(
    () => (sessionId ? ImportSessionStore.getRows(sessionId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision drives invalidation
    [sessionId, revision]
  );

  return { headers, rows, rowCount, sessionId };
}
