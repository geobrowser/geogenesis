'use client';

import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { Effect } from 'effect';

import { CLAIM_RESPONSE_OBJECT_TYPE } from '~/core/claims/browse/claim-response-summary';
import type { ClaimBand } from '~/core/graph-explorer/claim-band';
import { CLAIM_BAND_LABELS } from '~/core/graph-explorer/claim-band';
import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import type { GraphFilter } from '~/core/graph-explorer/graph-filter';
import { GRAPH_KIND_LABELS, type GraphKind } from '~/core/graph-explorer/graph-kinds';
import {
  type Counts,
  GROUP_ROWS,
  MIN_RESPONSES_FOR_BAND,
  type NeighbourGroup,
  agreementLine,
  bandTally,
  latestNews,
  mostLinked,
  shownAgreement,
  topClaimsInBand,
  votesLabel,
} from '~/core/graph-explorer/panel-sections';
import type { GraphSelection } from '~/core/graph-explorer/select-graph';
import { summaryPercent } from '~/core/graph-explorer/topic-claims-summary';
import { useTopicClaimsSummary } from '~/core/graph-explorer/use-graph-explorer';
import { getEntityResponseCounts } from '~/core/io/queries';
import { entityResponseCountsQueryKey } from '~/core/responses/entity-response';

import { Skeleton } from '~/design-system/skeleton';

import { BAND_SWATCHES, nodeDateLabel, nodeTypeLabel } from './connections/node-card';
import { typeNames } from './entity-panel';
import { useClaimSpaceBatches } from './graph-claim-list';

/** A claim the panel lists: read and counted in its own space. */
export type PanelClaim = { id: string; name: string; spaceId: string; relation?: string };

type Open = (id: string, name: string | null) => void;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <h3 id={id} className="text-footnote text-grey-04 uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({
  title,
  sub,
  relation,
  band,
  hidden = false,
  onClick,
}: {
  title: string;
  sub?: string | null;
  relation?: string | null;
  /** Claims only: their band swatch, grey below the threshold. */
  band?: ClaimBand | null;
  hidden?: boolean;
  onClick: () => void;
}) {
  if (hidden) return null;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-grey-01 focus-visible:bg-grey-01"
      >
        {band !== undefined && (
          <i
            aria-hidden
            className={cx(
              'mt-[5px] block h-[10px] w-[10px] shrink-0 rounded-[3px]',
              band ? BAND_SWATCHES[band] : 'bg-grey-02'
            )}
          />
        )}
        <span className="flex min-w-0 flex-col">
          {relation && <span className="truncate text-footnote text-grey-04">{relation}</span>}
          <span className="text-metadataMedium wrap-break-word text-text">{title}</span>
          {sub && <span className="text-footnote text-grey-04 tabular-nums">{sub}</span>}
        </span>
      </button>
    </li>
  );
}

/** A topic's overview: its fights and settled claims, who is most linked on the map and the newest news. */
export function TopicOverview({
  topicId,
  filter,
  topicSpaceId,
  selection,
  nodes,
  onOpen,
}: {
  topicId: string;
  filter: GraphFilter;
  topicSpaceId: string | null;
  selection: GraphSelection | null;
  /** Every loaded node, for dated news beyond the map's picks. */
  nodes: readonly GraphNode[];
  onOpen: Open;
}) {
  const summary = useTopicClaimsSummary(topicId, filter, topicSpaceId);
  const claims = summary.data?.claims ?? [];
  const fights = topClaimsInBand(claims, 'contested');
  const agreed = topClaimsInBand(claims, 'agreed');
  const people = mostLinked(selection, topicId);
  const news = latestNews(nodes);
  const claimLine = (claim: (typeof claims)[number]) =>
    `${summaryPercent(claim)}% agree · ${votesLabel(claim.positive + claim.negative)}`;

  return (
    <>
      {summary.data && claims.length > 0 && fights.length === 0 && agreed.length === 0 && (
        <p className="text-metadata text-grey-04">
          No claim here has {MIN_RESPONSES_FOR_BAND} or more votes yet, so none is listed as a fight or as widely
          agreed.
        </p>
      )}
      {fights.length > 0 && (
        <Section title="The biggest fights">
          <ul className="flex flex-col">
            {fights.map(claim => (
              <Row
                key={claim.id}
                title={claim.name}
                sub={claimLine(claim)}
                band={claim.band}
                onClick={() => onOpen(claim.id, claim.name)}
              />
            ))}
          </ul>
        </Section>
      )}
      {agreed.length > 0 && (
        <Section title="Widely agreed, most votes">
          <ul className="flex flex-col">
            {agreed.map(claim => (
              <Row
                key={claim.id}
                title={claim.name}
                sub={claimLine(claim)}
                band={claim.band}
                onClick={() => onOpen(claim.id, claim.name)}
              />
            ))}
          </ul>
        </Section>
      )}
      {people.length > 0 && (
        <Section title="People and groups">
          <ul className="flex flex-col">
            {people.map(({ node, links }) => (
              <Row
                key={node.id}
                title={node.name ?? node.id}
                sub={[nodeTypeLabel(node), `${links} ${links === 1 ? 'link' : 'links'}`].filter(Boolean).join(' · ')}
                onClick={() => onOpen(node.id, node.name)}
              />
            ))}
          </ul>
        </Section>
      )}
      {news.length > 0 && (
        <Section title="Latest news">
          <ul className="flex flex-col">
            {news.map(({ node }) => (
              <Row
                key={node.id}
                title={node.name ?? node.id}
                sub={[nodeTypeLabel(node), nodeDateLabel(node)].filter(Boolean).join(' · ')}
                onClick={() => onOpen(node.id, node.name)}
              />
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function ShowAll({ total, onClick }: { total: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start px-1 text-metadataMedium text-text underline-offset-2 hover:underline"
    >
      Show all {total}
    </button>
  );
}

/** The neighbour's type for its kind, and its date where it has one. */
function rowSub(entity: { types: Array<{ name: string | null }> }, node: GraphNode | undefined) {
  if (!node) return typeNames(entity)[0] ?? null;
  return [nodeTypeLabel(node) ?? typeNames(entity)[0], nodeDateLabel(node)].filter(Boolean).join(' · ') || null;
}

function heading(kind: GraphKind, count: number, more: boolean) {
  return `${GRAPH_KIND_LABELS[kind]} · ${count}${more ? '+' : ''}`;
}

/** One group of neighbours: six rows, then the rest behind "Show all". */
function KindGroup({ group, more, onOpen }: { group: NeighbourGroup; more: boolean; onOpen: Open }) {
  const [all, setAll] = React.useState(false);
  return (
    <Section title={heading(group.kind, group.spokes.length, more)}>
      <ul className="flex flex-col">
        {group.spokes.map(({ spoke, node }, index) => (
          <Row
            key={spoke.entity.id}
            hidden={!all && index >= GROUP_ROWS}
            relation={spoke.labels.join(' · ')}
            title={spoke.entity.name ?? spoke.entity.id}
            sub={rowSub(spoke.entity, node)}
            onClick={() => onOpen(spoke.entity.id, spoke.entity.name)}
          />
        ))}
      </ul>
      {!all && group.spokes.length > GROUP_ROWS && <ShowAll total={group.spokes.length} onClick={() => setAll(true)} />}
    </Section>
  );
}

/** Space-scoped stance counts per claim, loaded in one batch per claim space. */
function useClaimCounts(claims: readonly PanelClaim[]) {
  const { status, batches } = useClaimSpaceBatches(claims);
  const results = useQueries({
    queries: claims.map(claim => ({
      queryKey: entityResponseCountsQueryKey(claim.id, claim.spaceId, CLAIM_RESPONSE_OBJECT_TYPE, 'stance'),
      queryFn: () =>
        Effect.runPromise(getEntityResponseCounts(claim.id, claim.spaceId, 'stance', CLAIM_RESPONSE_OBJECT_TYPE)),
      // The batch fills these; a claim reads its own only when its space's batch failed.
      enabled: status[claim.spaceId] === 'failed',
      staleTime: 30_000,
    })),
  });
  const counts = claims.map((_, index) => results[index]?.data as Counts | undefined);
  const settled = claims.every(claim => status[claim.spaceId] === 'ready' || status[claim.spaceId] === 'failed');
  return { counts, settled, batches };
}

/** Claims around the centre, most votes first once counted, with their bands in one bar. */
function ClaimsGroup({
  claims,
  more,
  loading,
  onLoadMore,
  loadingMore,
  onOpen,
}: {
  claims: readonly PanelClaim[];
  more: boolean;
  loading: boolean;
  onLoadMore: (() => void) | null;
  loadingMore: boolean;
  onOpen: Open;
}) {
  const [all, setAll] = React.useState(false);
  const { counts, settled, batches } = useClaimCounts(claims);
  const rows = claims.map((claim, index) => ({ claim, counts: counts[index] }));
  // Sorted once every count is in, so rows don't jump as each space answers.
  const total = (entry: (typeof rows)[number]) => (entry.counts ? entry.counts.positive + entry.counts.negative : 0);
  if (settled) rows.sort((a, b) => total(b) - total(a));
  const tally = bandTally(counts);

  return (
    <Section title={heading('claim', claims.length, more)}>
      {batches}
      {loading ? (
        <Skeleton className="h-[72px] w-full rounded-lg" />
      ) : (
        <>
          {tally.banded > 1 && <BandBar bands={tally.bands} banded={tally.banded} />}
          <ul className="flex flex-col">
            {rows.map(({ claim, counts: claimCounts }, index) => (
              <Row
                key={claim.id}
                hidden={!all && index >= GROUP_ROWS}
                relation={claim.relation}
                title={claim.name}
                sub={agreementLine(claimCounts)}
                band={shownAgreement(claimCounts).band}
                onClick={() => onOpen(claim.id, claim.name)}
              />
            ))}
          </ul>
          {!all && claims.length > GROUP_ROWS && <ShowAll total={claims.length} onClick={() => setAll(true)} />}
          {(all || claims.length <= GROUP_ROWS) && onLoadMore && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={onLoadMore}
              className="self-start px-1 text-metadataMedium text-text underline-offset-2 hover:underline disabled:text-grey-04"
            >
              {loadingMore ? 'Loading…' : 'Show more claims'}
            </button>
          )}
        </>
      )}
    </Section>
  );
}

function BandBar({ bands, banded }: { bands: Record<ClaimBand, number>; banded: number }) {
  const order = Object.keys(CLAIM_BAND_LABELS) as ClaimBand[];
  return (
    <div className="flex flex-col gap-1 px-1 pb-1">
      <div aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-grey-02">
        {order.map(band =>
          bands[band] ? (
            <span key={band} className={BAND_SWATCHES[band]} style={{ width: `${(bands[band] / banded) * 100}%` }} />
          ) : null
        )}
      </div>
      <p className="text-footnote text-grey-04">
        Of {banded} with {MIN_RESPONSES_FOR_BAND}+ votes:{' '}
        {order
          .filter(band => bands[band])
          .map(band => `${bands[band]} ${CLAIM_BAND_LABELS[band].toLowerCase()}`)
          .join(', ')}
      </p>
    </div>
  );
}

/** Everything around the centre in one list, by kind, in the prototype's order. */
export function NeighbourGroups({
  groups,
  claims,
  claimsState,
  moreKinds,
  emptyMessage,
  claimsEmptyMessage,
  onOpen,
}: {
  groups: readonly NeighbourGroup[];
  /** Claims about the centre and claims linked to it; they replace `groups`' claim group. */
  claims: readonly PanelClaim[];
  claimsState: {
    isLoading: boolean;
    isError: boolean;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => void;
  };
  moreKinds: readonly GraphKind[];
  emptyMessage: string;
  /** Null when no claims are asked about the centre (it is itself a claim): nothing to report. */
  claimsEmptyMessage: string | null;
  onOpen: Open;
}) {
  const others = groups.filter(group => group.kind !== 'claim');
  const hasClaims = claims.length > 0 || claimsState.isLoading;
  const claimsSettledEmpty = claimsEmptyMessage !== null && !hasClaims && !claimsState.hasNextPage;
  return (
    <div className="flex flex-col gap-5">
      {hasClaims && (
        <ClaimsGroup
          claims={claims}
          more={claimsState.hasNextPage}
          loading={claimsState.isLoading && claims.length === 0}
          onLoadMore={claimsState.hasNextPage ? claimsState.fetchNextPage : null}
          loadingMore={claimsState.isFetchingNextPage}
          onOpen={onOpen}
        />
      )}
      {!hasClaims && claimsState.hasNextPage && (
        <Section title="Claims">
          <p className="px-1 text-metadata text-grey-04">None of the claims loaded so far can be shown here.</p>
          <ShowMoreClaims state={claimsState} />
        </Section>
      )}
      {others.map(group => (
        <KindGroup key={group.kind} group={group} more={moreKinds.includes(group.kind)} onOpen={onOpen} />
      ))}
      {others.length === 0 && !hasClaims && <p className="text-metadata text-grey-04">{emptyMessage}</p>}
      {claimsSettledEmpty && (
        <p className="text-metadata text-grey-04">
          {claimsState.isError ? 'Couldn’t load claims.' : claimsEmptyMessage}
        </p>
      )}
    </div>
  );
}

function ShowMoreClaims({ state }: { state: { isFetchingNextPage: boolean; fetchNextPage: () => void } }) {
  return (
    <button
      type="button"
      disabled={state.isFetchingNextPage}
      onClick={state.fetchNextPage}
      className="self-start px-1 text-metadataMedium text-text underline-offset-2 hover:underline disabled:text-grey-04"
    >
      {state.isFetchingNextPage ? 'Loading…' : 'Show more claims'}
    </button>
  );
}
