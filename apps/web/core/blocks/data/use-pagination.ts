import { atom, useAtom } from 'jotai';

import * as React from 'react';

/**
 * Global store of page numbers keyed by data block entity ID.
 * Survives navigation within the app but not page refresh.
 */
const pageNumbersAtom = atom<Map<string, number>>(new Map());

export function usePagination(entityId: string) {
  const [pageNumbers, setPageNumbers] = useAtom(pageNumbersAtom);
  const pageNumber = pageNumbers.get(entityId) ?? 0;

  const setPage = React.useCallback(
    (page: number | 'next' | 'previous') => {
      setPageNumbers(prev => {
        const current = prev.get(entityId) ?? 0;
        let next: number;

        switch (page) {
          case 'next':
            next = current + 1;
            break;
          case 'previous':
            next = current - 1 < 0 ? 0 : current - 1;
            break;
          default:
            next = page;
        }

        const updated = new Map(prev);
        updated.set(entityId, next);
        return updated;
      });
    },
    [entityId, setPageNumbers]
  );

  return {
    pageNumber,
    setPage,
  };
}
