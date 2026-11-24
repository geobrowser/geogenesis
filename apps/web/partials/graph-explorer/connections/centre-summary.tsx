'use client';

import * as React from 'react';

import cx from 'classnames';

import { ActionContextProvider } from '~/core/action-context-provider';
import { CLAIM_BAND_LABELS, type ClaimBand, MIN_RESPONSES_FOR_BAND } from '~/core/graph-explorer/claim-band';
import { useGraphAnalytics } from '~/core/graph-explorer/graph-explorer-analytics';
import type { GraphFilter } from '~/core/graph-explorer/graph-filter';
import { MAX_TOPIC_CLAIMS, claimsHeadline, summaryPercent } from '~/core/graph-explorer/topic-claims-summary';
import { useTopicClaimsSummary } from '~/core/graph-explorer/use-graph-explorer';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { GraphClaimPosition } from './graph-claim-position';
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
  const analytics = useGraphAnalytics();
  const seenRef = useSeenFor(1_000, topicId, () => analytics?.interacted({ interaction: 'summary_seen' }));
  if (summary.isLoading) return <Skeleton className="h-[96px] w-full rounded-lg" />;
  if (summary.isError || !summary.data) {
    return <p className="text-metadata text-grey-04">Couldn’t load how people responded to this topic’s claims.</p>;
  }
  const { claims, truncated } = summary.data;
  const headline = claimsHeadline(claims);
  const top = claims[0];
  const topTotal = top ? top.positive + top.negative : 0;
  const counted = `only its first ${MAX_TOPIC_CLAIMS.toLocaleString('en-US')} claims were counted`;
  return (
    <section ref={seenRef} aria-label="How people responded" className="flex flex-col gap-3 rounded-xl bg-grey-01 p-3">
      <h3 className="text-metadataMedium text-text">How people responded</h3>
      {!headline ? (
        <p className="text-metadata text-grey-04">
          {truncated
            ? `None of the first ${MAX_TOPIC_CLAIMS.toLocaleString('en-US')} claims about this topic have responses yet.`
            : 'No claims about this topic have responses yet.'}
        </p>
      ) : (
        <>
          <p className="text-metadata text-grey-04">
            {truncated ? `At least ${headline.text}; ${counted}.` : `${headline.text}.`}
          </p>
          {headline.bands && (
            <ul className="flex flex-col gap-1">
              {(Object.keys(CLAIM_BAND_LABELS) as ClaimBand[]).map(band => (
                <li key={band} className="flex items-center gap-2 text-metadata text-text">
                  <i aria-hidden className={cx('block h-[10px] w-[10px] rounded-[3px]', BAND_SWATCHES[band])} />
                  {CLAIM_BAND_LABELS[band]}
                  <span className="ml-auto font-medium tabular-nums">{headline.bands![band]}</span>
                </li>
              ))}
            </ul>
          )}
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
              {topTotal >= MIN_RESPONSES_FOR_BAND ? `${summaryPercent(top)}% agree · ` : ''}
              {topTotal} {topTotal === 1 ? 'response' : 'responses'}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

/** Responding to a claim from the map, in the claim's own space. */
export function ClaimActions({ claimId, spaceId }: { claimId: string; spaceId: string }) {
  const analytics = useGraphAnalytics();
  return (
    <section aria-label="Respond" className="flex flex-col gap-3 rounded-xl bg-grey-01 p-3">
      <ActionContextProvider value={{ list_id: 'graph_explorer_centre' }}>
        <GraphClaimPosition claimId={claimId} spaceId={spaceId} />
      </ActionContextProvider>
      <Link
        href={NavUtils.toEntity(spaceId, claimId)}
        onClick={() => analytics?.interacted({ interaction: 'open_page', value: 'claim', target_id: claimId })}
        className="self-start text-metadataMedium text-text underline-offset-2 hover:underline"
      >
        Open the claim →
      </Link>
    </section>
  );
}

/**
 * A ref whose element, at least half visible for `ms`, calls `onSeen`. A pending call is dropped
 * on unmount and when `key` changes, so it never reports for the next centre.
 */
function useSeenFor(ms: number, key: string, onSeen: () => void) {
  const callback = React.useRef(onSeen);
  React.useEffect(() => {
    callback.current = onSeen;
  });
  const observer = React.useRef<IntersectionObserver | null>(null);
  const timer = React.useRef<number | undefined>(undefined);
  const stop = React.useCallback(() => {
    observer.current?.disconnect();
    observer.current = null;
    window.clearTimeout(timer.current);
  }, []);
  React.useEffect(() => stop, [stop]);
  return React.useCallback(
    (element: HTMLElement | null) => {
      stop();
      if (!element || typeof IntersectionObserver === 'undefined') return;
      // A new key gives a new ref, so the old element is let go and its pending call dropped.
      void key;
      observer.current = new IntersectionObserver(
        ([entry]) => {
          window.clearTimeout(timer.current);
          if (entry?.isIntersecting) timer.current = window.setTimeout(() => callback.current(), ms);
        },
        { threshold: 0.5 }
      );
      observer.current.observe(element);
    },
    [key, ms, stop]
  );
}
