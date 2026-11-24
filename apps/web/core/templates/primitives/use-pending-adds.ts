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
 * Rows a template `+` added (GEO-3836), drawn ahead of the list until the list has them itself.
 *
 * `add` draws a pending row at once. When the publish succeeds the row becomes the real entity (its
 * id, its space), and once the refetched list holds that id this row is dropped in favour of the
 * list's. A failed publish drops the row; the failure itself has already been shown.
 *
 * A row the list never picks up stays for as long as the section is mounted: a non-member's
 * addition published to their personal space, where the page's lists don't read.
 *
 * With no publish (a fixture page with no live callbacks), the row is added as it is.
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

  return { rows: visible, add };
}
