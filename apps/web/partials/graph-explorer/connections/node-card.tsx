'use client';

import * as React from 'react';

import cx from 'classnames';

import { useClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { type ClaimBand, claimBand } from '~/core/graph-explorer/claim-band';
import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { GRAPH_KIND_TYPE_IDS } from '~/core/graph-explorer/graph-kinds';
import { rowPublisher } from '~/core/graph-explorer/panel-sections';
import { normId } from '~/core/utils/norm-id';

import { entityImageSrc } from '../entity-avatar';

export const BAND_STYLES: Record<ClaimBand, string> = {
  agreed: 'bg-[#1e824c] text-white shadow-[0_10px_40px_rgba(30,130,76,.4)]',
  contested: 'bg-[#b75700] text-white shadow-[0_10px_40px_rgba(183,87,0,.4)]',
  rejected: 'bg-[#6833ff] text-white shadow-[0_10px_40px_rgba(104,51,255,.4)]',
};

export const BAND_SWATCHES: Record<ClaimBand, string> = {
  agreed: 'bg-[#1e824c]',
  contested: 'bg-[#b75700]',
  rejected: 'bg-[#6833ff]',
};

/** The node's own type name ("Article", "News event"), for the line above its title. */
export function nodeTypeLabel(node: GraphNode): string | null {
  const order = GRAPH_KIND_TYPE_IDS[node.kind];
  const ranked = node.types
    .map(type => ({ name: type.name, rank: order.indexOf(normId(type.id)) }))
    .filter(type => type.rank >= 0 && type.name)
    .sort((a, b) => a.rank - b.rank);
  return ranked[0]?.name ?? null;
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function nodeDateLabel(node: GraphNode): string | null {
  if (!node.date) return null;
  const date = new Date(node.date);
  return Number.isNaN(date.getTime()) ? null : DATE_FORMAT.format(date);
}

const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * A source's line above its title: type · outlet · month, each only when known ("Report · BBC Verify · Mar 2025").
 * Around its own publisher the outlet is dropped, as the panel's rows drop it, or every card would repeat the centre.
 */
export function sourceEyebrow(node: GraphNode, centreId: string | null): string | null {
  const date = node.date ? new Date(node.date) : null;
  const month = date && !Number.isNaN(date.getTime()) ? MONTH_FORMAT.format(date) : null;
  const name = rowPublisher(node, centreId)?.name;
  const outlet = name && name !== node.name ? name : null;
  return [nodeTypeLabel(node), outlet, month].filter(Boolean).join(' · ') || null;
}

/** Hop 2 is too far to read: it drops its text and keeps a small marker (the centre never does). */
export function isFarNode(hop: 0 | 1 | 2, isCentre: boolean) {
  return hop === 2 && !isCentre;
}

/** A far node's marker: its band's color for a claim, else its kind's; hollow while a claim has no band. */
export function farMarkerClass(kind: GraphNode['kind'], band: ClaimBand | null): string {
  if (kind === 'claim') return band ? cx('h-3 w-3 rounded-[3px]', BAND_SWATCHES[band]) : FAR_HOLLOW;
  return FAR_MARKERS[kind] ?? FAR_HOLLOW;
}

const FAR_HOLLOW = 'h-3 w-3 rounded-[3px] border border-white/50';
const FAR_MARKERS: Partial<Record<GraphNode['kind'], string>> = {
  topic: 'h-2 w-4 rounded-full bg-grey-03',
  story: 'h-3 w-3 rounded-[3px] bg-grey-01',
  event: 'h-3 w-3 rounded-[3px] bg-[#d9b46a]',
  case: 'h-3 w-3 rounded-[3px] bg-[#4c8dff]',
  src: 'h-3 w-[10px] rounded-[2px] border-[1.5px] border-dashed border-white/70',
};

/**
 * The centre's mark, whatever its kind: a white ring a few pixels out. An outline, not a shadow, so
 * the band and card shadows it sits on can't override it.
 */
export const CENTRE_RING = 'outline-2 outline-offset-[3px] outline-white';

type CardProps = { node: GraphNode; hop: 0 | 1 | 2; isCentre: boolean; phone: boolean };

const LABEL = 'line-clamp-2 text-[12px] font-medium leading-[1.3]';
const DARK_CARD =
  'bg-[rgba(28,28,32,.86)] text-[#f2f2f2] shadow-[inset_0_0_0_1px_rgba(255,255,255,.16),0_10px_30px_rgba(0,0,0,.45)]';

/** Label size: the design's 11px on phone and for far nodes, larger for the centre. */
function labelSize({ isCentre, phone, hop }: Pick<CardProps, 'isCentre' | 'phone' | 'hop'>) {
  if (isCentre) return cx('font-semibold', phone ? 'text-[13px]' : 'text-[14px]');
  return phone || hop === 2 ? 'text-[11px]' : null;
}

/** What a node looks like, by kind. Claims read their space-scoped counts (`claimSpaceId`). */
export function NodeCard({
  claimSpaceId,
  centreId = null,
  ...props
}: CardProps & { claimSpaceId: string | null; centreId?: string | null }) {
  const far = isFarNode(props.hop, props.isCentre);
  if (props.node.kind === 'claim' && claimSpaceId) return <ClaimCard {...props} spaceId={claimSpaceId} />;
  if (props.node.kind === 'ent' || props.node.kind === 'other') return <EntityCard {...props} />;
  if (far) return <FarMarker node={props.node} band={null} />;
  const card = props.node.kind === 'topic' ? <TopicCard {...props} /> : <ItemCard {...props} centreId={centreId} />;
  return props.isCentre ? (
    card
  ) : (
    <ShrinksToMarker marker={<FarMarker node={props.node} band={null} />}>{card}</ShrinksToMarker>
  );
}

/**
 * A hop-1 card the map draws too small to read (the canvas sets `data-far` on its button) swaps to
 * its marker by CSS alone, so nothing re-renders per frame.
 */
function ShrinksToMarker({ children, marker }: { children: React.ReactNode; marker: React.ReactNode }) {
  return (
    <>
      <span className="contents group-data-[far]:hidden">{children}</span>
      <span className="hidden group-data-[far]:contents">{marker}</span>
    </>
  );
}

/** A far node: a small marker with no text; its name shows on hover or focus, below it. */
function FarMarker({ node, band }: { node: GraphNode; band: ClaimBand | null }) {
  return (
    <span data-far-marker className="relative flex items-center justify-center p-1">
      <span aria-hidden className={cx('block', farMarkerClass(node.kind, band))} />
      <FarName name={node.name} />
    </span>
  );
}

/** Out of flow, so showing it never resizes the measured box. */
function FarName({ name }: { name: string | null }) {
  return (
    <span className="pointer-events-none absolute top-[calc(100%+4px)] left-1/2 hidden w-max max-w-[180px] -translate-x-1/2 rounded-md bg-white px-2 py-1 text-center text-[11px] leading-[1.3] font-medium text-[#151515] group-hover:block group-focus-visible:block">
      <span className="line-clamp-3">{name}</span>
    </span>
  );
}

/** The centre topic is the white pill; topics around it are small gray ones, quieter than claims and people. */
function TopicCard({ node, hop, isCentre, phone }: CardProps) {
  if (!isCentre)
    return (
      <span
        data-label
        className={cx(
          'block rounded-full bg-grey-05 px-[10px] py-1 text-center text-grey-02 shadow-[0_0_0_1px_rgba(255,255,255,.1)]',
          phone ? 'max-w-[130px]' : 'max-w-[170px]'
        )}
      >
        <span className={cx(LABEL, 'text-[11px]')}>{node.name}</span>
      </span>
    );
  return (
    <span
      data-label
      className={cx(
        'block rounded-full bg-white text-center text-[#151515]',
        CENTRE_RING,
        phone ? 'max-w-[200px] px-3 py-[6px]' : 'max-w-[260px] px-[18px] py-[10px]'
      )}
    >
      <span className={cx(LABEL, 'font-semibold', labelSize({ isCentre, phone, hop }))}>{node.name}</span>
    </span>
  );
}

function EntityCard({ node, hop, isCentre, phone }: CardProps) {
  const src = entityImageSrc(node);
  const [failed, setFailed] = React.useState(false);
  const far = isFarNode(hop, isCentre);
  const size = isCentre ? (phone ? 64 : 84) : far ? 24 : phone ? 40 : 52;
  const width = isCentre ? (phone ? 'w-[110px]' : 'w-[150px]') : far ? null : phone ? 'w-[84px]' : 'w-[112px]';
  return (
    <span className={cx('relative flex flex-col items-center gap-1 text-center', width)}>
      <span
        data-anchor
        className={cx(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#333] text-[#ddd]',
          isCentre ? CENTRE_RING : 'shadow-[0_0_0_1px_rgba(255,255,255,.18),0_10px_30px_rgba(0,0,0,.5)]'
        )}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      >
        {src && !failed ? (
          <img
            src={src}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          node.name?.charAt(0).toUpperCase()
        )}
      </span>
      {far ? (
        <FarName name={node.name} />
      ) : (
        <span
          data-label
          className={cx(
            LABEL,
            'rounded-md bg-white px-2 py-[2px] text-[#151515]',
            !isCentre && 'group-data-[far]:hidden',
            labelSize({ isCentre, phone, hop })
          )}
        >
          {node.name}
        </span>
      )}
      {!far && !isCentre && (
        <span className="hidden group-data-[far]:contents">
          <FarName name={node.name} />
        </span>
      )}
    </span>
  );
}

const ITEM_STYLES: Record<string, string> = {
  story: 'bg-[rgba(246,246,246,.96)] text-[#151515]',
  // Evidence reads apart from claims: a dashed edge instead of the solid one.
  src: 'border border-dashed border-white/40 bg-[rgba(28,28,32,.86)] text-[#f2f2f2] shadow-[0_10px_30px_rgba(0,0,0,.45)]',
  case: 'bg-[rgba(28,28,32,.86)] text-[#f2f2f2] shadow-[inset_3px_0_0_#4c8dff,inset_0_0_0_1px_rgba(255,255,255,.16),0_10px_30px_rgba(0,0,0,.45)]',
};

/** Card width and padding for items and claims, by place and screen. */
function cardBox({ isCentre, phone }: Pick<CardProps, 'isCentre' | 'phone'>, desktop: [string, string]) {
  if (phone) return isCentre ? 'w-[170px] p-2' : 'w-[120px] p-2';
  return cx('px-3 py-[10px]', isCentre ? desktop[0] : desktop[1]);
}

function ItemCard({ node, hop, isCentre, phone, centreId }: CardProps & { centreId: string | null }) {
  const source = node.kind === 'src';
  const meta = source
    ? sourceEyebrow(node, centreId)
    : [nodeTypeLabel(node), nodeDateLabel(node)].filter(Boolean).join(' · ');
  return (
    <span
      data-label
      data-source-card={source || undefined}
      className={cx(
        // Blur behind every card is too much for low-end phones.
        'flex flex-col items-start gap-1 rounded-xl text-left',
        !phone && 'backdrop-blur-[6px]',
        ITEM_STYLES[node.kind] ?? DARK_CARD,
        isCentre && CENTRE_RING,
        cardBox({ isCentre, phone }, ['w-[230px]', 'w-[176px]'])
      )}
    >
      {meta && (
        <span
          className={cx(
            'text-[11px] font-medium',
            source ? 'line-clamp-1 text-[#a8a8a8]' : node.kind === 'story' ? 'text-[#4b4b4b]' : 'text-[#d9b46a]'
          )}
        >
          {meta}
        </span>
      )}
      <span className={cx(LABEL, 'line-clamp-3', labelSize({ isCentre, phone, hop }))}>{node.name}</span>
    </span>
  );
}

function ClaimCard({ node, hop, isCentre, phone, spaceId }: CardProps & { spaceId: string }) {
  const summary = useClaimResponseSummary(node.id, spaceId, 'stance');
  const ready = !summary.isLoading && summary.hasCounts;
  const band = ready ? claimBand(summary.positive, summary.negative) : null;
  const state = band ?? (ready ? 'none' : 'loading');
  const marker = (
    <span data-band={state} className="contents">
      <FarMarker node={node} band={band} />
    </span>
  );
  if (isFarNode(hop, isCentre)) return marker;
  const card = (
    <span
      data-band={state}
      data-label
      className={cx(
        'flex flex-col items-start gap-1 rounded-xl text-left transition-colors duration-300',
        band ? BAND_STYLES[band] : DARK_CARD,
        isCentre && CENTRE_RING,
        cardBox({ isCentre, phone }, ['w-[260px]', 'w-[200px]'])
      )}
    >
      <span className={cx(LABEL, !phone && 'line-clamp-3', labelSize({ isCentre, phone, hop }))}>{node.name}</span>
      {band && summary.percent !== null ? (
        <span className="flex w-full flex-col gap-1">
          <span className={cx('font-medium', phone ? 'text-[11px]' : 'text-[12px]')}>{summary.percent}% agree</span>
          <span className="block h-[3px] w-full overflow-hidden rounded-full bg-white/20">
            <span className="block h-full bg-white" style={{ width: `${summary.percent}%` }} />
          </span>
        </span>
      ) : (
        <ClaimStatusLine loading={summary.isLoading} answered={summary.hasCounts} />
      )}
    </span>
  );
  return isCentre ? card : <ShrinksToMarker marker={marker}>{card}</ShrinksToMarker>;
}

function ClaimStatusLine({ loading, answered }: { loading: boolean; answered: boolean }) {
  if (loading) return <span aria-hidden className="block h-[10px] w-16 animate-pulse rounded bg-white/10" />;
  return <span className="text-[11px] text-[#a8a8a8]">{answered ? 'No responses yet' : 'Responses unavailable'}</span>;
}
