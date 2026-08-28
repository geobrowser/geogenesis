'use client';

import * as React from 'react';

import {
  useEntityResponseIndexingSnapshot,
  useResetEntityResponseIndexingSnapshot,
} from '~/core/hooks/use-entity-vote';

import type { DebateClaim } from './api';

/**
 * Clears the optimistic response snapshot once geo-chat's own copy of the viewer's response
 * agrees with what was expected.
 *
 * This used to live inside `ClaimDebateReadiness`, which existed to draw the Debate toggle. The
 * toggle is gone (GEO-2740) but this is not part of it: the snapshot is what
 * `useClaimResponseIndexedNotifier` watches to fire `notifyClaimResponseIndexed`, and that
 * notification is now what *creates* readiness server-side. So it matters more than it did, not
 * less, and it has to outlive the control it was written next to.
 *
 * It has to compare against geo-chat's view rather than the graph's. The point of the snapshot is
 * the window where the two disagree — the graph has the response and geo-chat has not caught up —
 * so retiring it on the graph's copy would clear it while the thing it is tracking is still true.
 *
 * Call this wherever a `DebateClaim` is already loaded for the entity. Surfaces that never had one
 * do not need it: nothing there reads the snapshot for display, and the notifier dedupes by
 * `runId` on its own.
 */
export function useRetireConfirmedResponseIndexing({
  debateClaim,
  entityId,
  spaceId,
}: {
  debateClaim: DebateClaim | null;
  entityId: string;
  spaceId: string;
}) {
  const responseKind = debateClaim?.response_kind ?? null;
  const responseIndexing = useEntityResponseIndexingSnapshot({ entityId, spaceId, responseKind });
  const resetResponseIndexing = useResetEntityResponseIndexingSnapshot({ entityId, spaceId, responseKind });
  const viewerResponse = debateClaim?.viewer_response ?? null;

  React.useEffect(
    function retireConfirmedOptimisticResponse() {
      if (!debateClaim) return;
      if (responseIndexing.status !== 'indexed') return;
      const expectedResponse = responseIndexing.pending.expectedResponse;
      const confirmed =
        expectedResponse === null ? viewerResponse === null : viewerResponse?.position === (expectedResponse === 'positive');
      if (confirmed) resetResponseIndexing(responseIndexing.runId);
    },
    [debateClaim, resetResponseIndexing, responseIndexing, viewerResponse]
  );
}
