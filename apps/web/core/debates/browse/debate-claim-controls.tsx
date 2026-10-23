'use client';

import * as React from 'react';

import { ClaimSummary } from '~/core/claims/browse/claim-summary';
import type { DebateActionAnalyticsSurface } from '~/core/debates/matchmaking/hub-analytics';
import { PositionRow } from '~/core/debates/matchmaking/matchmaking-claim-card';

import { Text } from '~/design-system/text';

import type { useDebateClaimResponse } from './use-debate-claim-response';

/**
 * A claim's Agree/Disagree pills, the error a failed response leaves, and — where the host wants it
 * — the claim's split, for a claim inside a debate.
 *
 * The claims panel, the end card and the debate card all draw this from the same
 * `useDebateClaimResponse` result. They were three copies of the same wiring, and the part worth
 * having once is the part that drifts: which `control` field feeds which pill prop, and that the
 * split waits for its counts rather than drawing an empty bar.
 */
export function DebateClaimControls({
  claimId,
  spaceId,
  response: { responseKind, summary, control },
  showParticipants,
  endSlot,
  wideEndSlot = false,
  analyticsSurface,
  className,
  summaryLayout,
  summaryClassName,
}: {
  claimId: string;
  spaceId: string;
  response: Pick<ReturnType<typeof useDebateClaimResponse>, 'responseKind' | 'summary' | 'control'>;
  /** See `PositionRow`: off where the host already shows who voted. */
  showParticipants?: boolean;
  /** Actions drawn at the end of the row, dropping under the pills when the row is narrow. */
  endSlot?: React.ReactNode;
  /** The end slot carries a third action, so it needs a wider row to stay beside the pills. */
  wideEndSlot?: boolean;
  analyticsSurface?: DebateActionAnalyticsSurface;
  /** On the wrapper of the pills and the error, not on the split. */
  className?: string;
  /** Draw the claim's split after the pills, in this layout. Omitted: the host draws its own, or none. */
  summaryLayout?: 'stacked' | 'inline';
  summaryClassName?: string;
}) {
  return (
    <>
      <div className={className}>
        <PositionRow
          positions={control.optimisticPositions}
          responseKind={responseKind}
          viewerPosition={control.viewerPosition}
          onRespond={control.respond}
          disabled={!control.canRespond}
          pending={control.isResponseSubmitting}
          titleFor={control.actionTitle}
          localSide={control.localVoteSide}
          showParticipants={showParticipants}
          endSlot={endSlot}
          endSlotWraps={endSlot == null ? undefined : wideEndSlot ? 'wide' : 'compact'}
          analyticsSurface={analyticsSurface}
        />
        {control.responseError ? (
          <div role="alert" className="mt-1.5">
            <Text as="p" variant="footnote" color="red-01">
              {control.responseError}
            </Text>
          </div>
        ) : null}
      </div>
      {summaryLayout && !summary.isLoading ? (
        <ClaimSummary
          entityId={claimId}
          spaceId={spaceId}
          responseKind={responseKind}
          summary={summary}
          layout={summaryLayout}
          className={summaryClassName}
        />
      ) : null}
    </>
  );
}
