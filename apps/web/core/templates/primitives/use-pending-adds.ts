'use client';

import * as React from 'react';

import type { TemplateAddResult } from '../models';

/**
 * What a row is drawn from: still publishing, published as `id` in `spaceId`, or `local` on a
 * fixture page that has nothing to publish to.
 */
export type PendingAddState =
  { status: 'pending' } | { status: 'published'; id: string; spaceId: string } | { status: 'local' };

/** The status text a row shows in its meta slot while its publish is in flight. */
export const PUBLISHING_LABEL = 'Publishing…';

let nextPendingId = 0;

function normId(id: string) {
  return id.replace(/-/g, '').toLowerCase();
}

/**
 * Rows a template `+` added, drawn until the list holds their id: pending, then the published entity,
 * dropped on failure. Without a publish (fixture pages) the row is added as it is.
 */
export function usePendingAdds<Row extends { id: string }>(listedIds: readonly string[]) {
  const [rows, setRows] = React.useState<Row[]>([]);

  const add = React.useCallback(
    (build: (state: PendingAddState) => Omit<Row, 'id'>, publish: Promise<TemplateAddResult> | undefined) => {
      const tempId = `pending-add-${++nextPendingId}`;
      if (!publish) {
        setRows(prev => [{ ...build({ status: 'local' }), id: tempId } as Row, ...prev]);
        return;
      }
      setRows(prev => [{ ...build({ status: 'pending' }), id: tempId } as Row, ...prev]);
      void publish.then(
        result => {
          setRows(prev =>
            result.ok
              ? prev.map(row =>
                  row.id === tempId
                    ? ({
                        ...build({ status: 'published', id: result.id, spaceId: result.spaceId }),
                        id: result.id,
                      } as Row)
                    : row
                )
              : prev.filter(row => row.id !== tempId)
          );
        },
        () => setRows(prev => prev.filter(row => row.id !== tempId))
      );
    },
    []
  );

  const listed = React.useMemo(() => new Set(listedIds.map(normId)), [listedIds]);
  const visible = React.useMemo(() => rows.filter(row => !listed.has(normId(row.id))), [listed, rows]);
  // Once listed, a row is gone for good: a later list that leaves it out mustn't bring it back.
  React.useEffect(() => {
    if (visible.length !== rows.length) setRows(visible);
  }, [rows.length, visible]);

  return { rows: visible, add };
}
