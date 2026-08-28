'use client';

import * as React from 'react';

import cx from 'classnames';

import { ENTITY_RESPONSE_COPY, type ResponseKind } from '~/core/responses/entity-response';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { ClaimResponderAvatars } from '~/partials/entity-page/claim-voter-avatars';

import { CLAIM_RESPONSE_OBJECT_TYPE, type ClaimResponseSummary } from './claim-response-summary';

/**
 * Where opinion sits on a claim: one number, the split, and who is on each side.
 *
 * Renders from the first response onward. Only a claim nobody has answered has nothing to divide,
 * and that is the one case this is absent for — the response floor governs whether the split can
 * be called *controversial*, not whether it can be shown at all.
 */
export function ClaimVerdict({
  entityId,
  spaceId,
  responseKind,
  summary,
  viewerSpaceId,
}: {
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind;
  summary: ClaimResponseSummary;
  viewerSpaceId?: string | null;
}) {
  if (summary.isLoading) {
    return <Skeleton className="h-[132px] w-full rounded-lg" />;
  }

  if (summary.percent === null) return null;

  const copy = ENTITY_RESPONSE_COPY[responseKind];
  const percent = summary.percent;

  return (
    <section aria-label="Response summary" className="rounded-lg border border-grey-02 bg-white p-4 @[560px]:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        {/* The share and what it is a share *of*, stacked — the number carries the emphasis and the
            verb sits under it, rather than the two competing on one baseline. */}
        <div className="flex flex-col">
          <span className="text-[2.5rem] leading-none font-semibold tracking-[-1px] tabular-nums">{percent}%</span>
          <Text as="span" variant="metadata" color="grey-04" className="mt-1">
            {/* "Agreements" → "agree", "Verifications" → "verify" reads wrong; use the action verb. */}
            {copy.positiveAction.toLowerCase()}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          {summary.isControversial && (
            <span className="rounded-sm bg-orange/25 px-1.5 py-0.5 text-metadata font-medium text-text">
              Controversial
            </span>
          )}
          <Text as="span" variant="metadata" color="grey-04" className="tabular-nums">
            {summary.total} {summary.total === 1 ? 'response' : 'responses'}
          </Text>
        </div>
      </div>

      <div
        className="mt-4 flex h-2 overflow-hidden rounded-full bg-grey-01"
        role="img"
        aria-label={`${percent}% ${copy.positiveAction.toLowerCase()}, ${100 - percent}% ${copy.negativeAction.toLowerCase()}`}
      >
        <span className="bg-green" style={{ width: `${percent}%` }} />
        <span className="bg-red-01" style={{ width: `${100 - percent}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <SideSummary
          swatchClassName="bg-green"
          label={copy.positiveAction}
          count={summary.positive}
          entityId={entityId}
          spaceId={spaceId}
          responseKind={responseKind}
          viewerSpaceId={viewerSpaceId}
        />
        <SideSummary
          swatchClassName="bg-red-01"
          label={copy.negativeAction}
          count={summary.negative}
          entityId={entityId}
          spaceId={spaceId}
          responseKind={responseKind}
          viewerSpaceId={viewerSpaceId}
          alignEnd
        />
      </div>
    </section>
  );
}

/**
 * One side of the split. The avatar stack is only drawn on the positive side: `ClaimResponderAvatars`
 * reports everyone who responded rather than everyone on a given side, so rendering it twice would
 * show the same faces under both labels.
 */
function SideSummary({
  swatchClassName,
  label,
  count,
  entityId,
  spaceId,
  responseKind,
  viewerSpaceId,
  alignEnd = false,
}: {
  swatchClassName: string;
  label: string;
  count: number;
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind;
  viewerSpaceId?: string | null;
  alignEnd?: boolean;
}) {
  return (
    <div className={cx('flex min-w-0 items-center gap-2', alignEnd && 'justify-end')}>
      <span className={cx('size-2 shrink-0 rounded-xs', swatchClassName)} aria-hidden />
      <Text as="span" variant="metadataMedium" color="text" className="tabular-nums">
        {label} {count}
      </Text>
      {!alignEnd && count > 0 && (
        <ClaimResponderAvatars
          entityId={entityId}
          spaceId={spaceId}
          objectType={CLAIM_RESPONSE_OBJECT_TYPE}
          responseKind={responseKind}
          totalResponders={count}
          viewerSpaceId={viewerSpaceId}
        />
      )}
    </div>
  );
}
