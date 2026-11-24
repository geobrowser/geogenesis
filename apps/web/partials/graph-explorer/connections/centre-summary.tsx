'use client';

import * as React from 'react';

import cx from 'classnames';

import { ActionContextProvider } from '~/core/action-context-provider';
import { CLAIM_BAND_LABELS, type ClaimBand } from '~/core/graph-explorer/claim-band';
import type { GraphFilter } from '~/core/graph-explorer/graph-filter';
import { MAX_TOPIC_CLAIMS, summaryPercent } from '~/core/graph-explorer/topic-claims-summary';
import { useTopicClaimsSummary } from '~/core/graph-explorer/use-graph-explorer';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { ClaimAgreementLine } from '../panel-sections';
import { BAND_SWATCHES } from './node-card';

/** The topic's claims by agreement in its space, from real responses, stated as sparse as it is. */
export function TopicClaimsSummary({
  topicId,
  filter,
  topicSpaceId,
  onOpenClaim,
}: {
  topicId: string;
  filter: GraphFilter;
  topicSpaceId: string | null;
  onOpenClaim: (claimId: string) => void;
}) {
  const summary = useTopicClaimsSummary(topicId, filter, topicSpaceId);
  if (summary.isLoading) return <Skeleton className="h-[96px] w-full rounded-lg" />;
  if (summary.isError || !summary.data) {
    return <p className="text-metadata text-grey-04">Couldn’t load how people responded to this topic’s claims.</p>;
  }
  const { claims, bands, truncated } = summary.data;
  const top = claims[0];
  return (
    <section aria-label="How people responded" className="flex flex-col gap-3 rounded-xl bg-grey-01 p-3">
      <h3 className="text-metadataMedium text-text">How people responded</h3>
      {claims.length === 0 ? (
        <p className="text-metadata text-grey-04">
          {truncated
            ? `None of the first ${MAX_TOPIC_CLAIMS.toLocaleString('en-US')} claims about this topic have responses yet.`
            : 'No claims about this topic have responses yet.'}
        </p>
      ) : (
        <>
          <p className="text-metadata text-grey-04">
            {truncated ? 'At least ' : claims.length < 10 ? 'Only ' : ''}
            {claims.length} {claims.length === 1 ? 'claim' : 'claims'} about this topic{' '}
            {claims.length === 1 ? 'has' : 'have'} responses so far
            {truncated ? `; only its first ${MAX_TOPIC_CLAIMS.toLocaleString('en-US')} claims were counted.` : '.'}
          </p>
          <ul className="flex flex-col gap-1">
            {(Object.keys(CLAIM_BAND_LABELS) as ClaimBand[]).map(band => (
              <li key={band} className="flex items-center gap-2 text-metadata text-text">
                <i aria-hidden className={cx('block h-[10px] w-[10px] rounded-[3px]', BAND_SWATCHES[band])} />
                {CLAIM_BAND_LABELS[band]}
                <span className="ml-auto font-medium tabular-nums">{bands[band]}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1 border-t border-grey-02 pt-3">
            <span className="text-footnote text-grey-04 uppercase">Most responses</span>
            <button
              type="button"
              onClick={() => onOpenClaim(top.id)}
              className="text-left text-metadataMedium text-text underline-offset-2 hover:underline"
            >
              {top.name}
            </button>
            <span className="text-metadata text-grey-04 tabular-nums">
              {summaryPercent(top)}% agree · {top.positive + top.negative}{' '}
              {top.positive + top.negative === 1 ? 'response' : 'responses'}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

/** Responding to a claim from the map, in the claim's own space. */
export function ClaimActions({ claimId, spaceId }: { claimId: string; spaceId: string }) {
  return (
    <section aria-label="Respond" className="flex flex-col gap-3 rounded-xl bg-grey-01 p-3">
      <ActionContextProvider value={{ list_id: 'graph_explorer_centre' }}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <ClaimAgreementLine claimId={claimId} spaceId={spaceId} />
          <EntityVoteButtons entityId={claimId} spaceId={spaceId} responseKind="stance" hideClaimShare />
        </div>
      </ActionContextProvider>
      <Link
        href={NavUtils.toEntity(spaceId, claimId)}
        className="self-start text-metadataMedium text-text underline-offset-2 hover:underline"
      >
        Open the claim →
      </Link>
    </section>
  );
}
