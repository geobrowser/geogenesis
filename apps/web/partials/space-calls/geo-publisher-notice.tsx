'use client';

import * as React from 'react';

import Link from 'next/link';

import { HubPillButton } from '~/core/debates/matchmaking/hub-pill-button';
import { useAddGeoPublisher, useGeoPublisherNotice } from '~/core/space-calls/publisher/hooks';

import { Text } from '~/design-system/text';

export const GEO_PUBLISHER_NOTICE_COPY = {
  body: 'Calls in this space are only published to Geo once the Geo publisher is an editor.',
  add: 'Add Geo publisher',
  adding: 'Sending…',
  pending: 'Proposed · Under vote',
  executable: 'Approved · Execute it in Governance',
  checkFailed: "Couldn't check Geo publisher status",
  governance: 'Open Governance',
} as const;

/**
 * Shown to editors while the Geo publisher cannot write the space's calls to the graph (GEO-3593):
 * the Calls tab, the series form and the end-call confirm. Non-editors, and any answer other than
 * a definite "not an editor", see nothing.
 */
export function GeoPublisherNotice({
  spaceId,
  viewerIsEditor,
  className,
}: {
  spaceId: string;
  viewerIsEditor: boolean;
  className?: string;
}) {
  const state = useGeoPublisherNotice(spaceId, viewerIsEditor);
  const add = useAddGeoPublisher(spaceId);
  if (!viewerIsEditor || state === 'hidden') return null;

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg bg-grey-01 px-4 py-3 ${className ?? ''}`}
      data-testid="geo-publisher-notice"
      data-state={state}
    >
      <Text as="p" variant="metadata">
        {GEO_PUBLISHER_NOTICE_COPY.body}
      </Text>
      {state === 'check_failed' ? (
        <span className="text-metadata text-grey-04">{GEO_PUBLISHER_NOTICE_COPY.checkFailed}</span>
      ) : state === 'pending' || state === 'executable' ? (
        <span className="inline-flex items-center gap-2 text-metadata">
          <span className="text-grey-04">{GEO_PUBLISHER_NOTICE_COPY[state]}</span>
          <Link href={`/space/${spaceId}/governance`} className="text-ctaPrimary hover:underline">
            {GEO_PUBLISHER_NOTICE_COPY.governance}
          </Link>
        </span>
      ) : (
        <HubPillButton
          type="button"
          variant="primary"
          analyticsLabel="Add Geo publisher"
          pending={add.isPending}
          pendingLabel={GEO_PUBLISHER_NOTICE_COPY.adding}
          disabled={add.isPending}
          onClick={() => add.mutate()}
        >
          {GEO_PUBLISHER_NOTICE_COPY.add}
        </HubPillButton>
      )}
    </div>
  );
}
