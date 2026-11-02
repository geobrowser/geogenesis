'use client';

import * as React from 'react';

import { GeoChatRequestError } from '~/core/debates/api';
import { canRestoreDebate, debateVisibilityErrorMessage } from '~/core/debates/debate-removal';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { useDebatePageOutcome } from '~/core/debates/use-debate-page-outcome';
import { useRestoreDebate } from '~/core/debates/use-debate-removal';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useHydrated } from '~/core/hooks/use-hydrated';

import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

/**
 * What a removed debate's page shows instead of the debate (GEO-2785): no video, no transcript,
 * no title — the removal was made to withhold those. Neutral on purpose: it does not say who
 * removed it or why, which geo-chat does not disclose either.
 *
 * Someone who can undo the removal — an editor of the space, or the person who removed it from this
 * browser (see `canRestoreDebate`) — is offered Restore.
 */
export function DebateRemovedView({
  spaceId,
  debateId,
  reportOutcome = true,
}: {
  spaceId: string;
  debateId: string;
  /**
   * Report this visit's `debate_page_outcome` from here. Off when the feed renders this view,
   * since the feed already reports the same visit.
   */
  reportOutcome?: boolean;
}) {
  const outcome = useDebatePageOutcome(reportOutcome ? debateId : undefined);
  React.useEffect(() => {
    outcome?.feed({ kind: 'unavailable', detail: 'removed' });
  }, [outcome]);

  const hydrated = useHydrated();
  const { isEditor } = useAccessControl(spaceId);
  const viewerUserId = useCurrentGeoChatUserId();
  // Read after hydration: it consults this browser's own record of removals, which the server
  // render cannot see.
  const canRestore = hydrated && canRestoreDebate({ debateId, viewerUserId, isSpaceEditor: isEditor });

  const restore = useRestoreDebate(debateId);
  const errorMessage =
    restore.error != null
      ? debateVisibilityErrorMessage(
          restore.error instanceof GeoChatRequestError ? restore.error.code : null,
          'restore'
        )
      : null;

  return (
    <div
      data-testid="debate-removed"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <Text as="h1" variant="mediumTitle">
        This debate has been removed
      </Text>
      {canRestore && (
        <div className="flex flex-col items-center gap-2">
          <Button
            variant="secondary"
            disabled={restore.isPending}
            onClick={() => restore.mutate()}
            data-geo-analytics-label="Restore debate"
            data-geo-analytics-intent="debate_action"
          >
            {restore.isPending ? 'Restoring…' : 'Restore'}
          </Button>
          {errorMessage && (
            <div role="alert">
              <Text as="p" variant="metadata" color="red-01">
                {errorMessage}
              </Text>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
