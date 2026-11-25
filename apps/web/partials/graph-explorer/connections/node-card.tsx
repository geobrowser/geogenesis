'use client';

import * as React from 'react';

import cx from 'classnames';

import { useClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { type ClaimBand, claimBand } from '~/core/graph-explorer/claim-band';
import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { GRAPH_KIND_TYPE_IDS } from '~/core/graph-explorer/graph-kinds';
import { rowPublisher } from '~/core/graph-explorer/panel-sections';
import { isPhonePin } from '~/core/graph-explorer/phone-breakpoint';
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
export function nodeTypeLabel(node: Pick<GraphNode, 'kind' | 'types'>): string | null {
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

export function nodeDateLabel(node: Pick<GraphNode, 'date'>): string | null {
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
  if (kind === 'claim') return band ? cx(FAR_SQUARE, BAND_SWATCHES[band], FAR_BAND_GLOWS[band]) : FAR_HOLLOW;
  return FAR_MARKERS[kind] ?? FAR_HOLLOW;
}

// The prototype's Geo look: 14px rounded squares, a claim's in its band's color with a white ring and a glow.
const FAR_SQUARE = 'h-[14px] w-[14px] rounded-[4px]';
const FAR_HOLLOW = cx(FAR_SQUARE, 'border border-white/50');
const FAR_BAND_GLOWS: Record<ClaimBand, string> = {
  agreed: 'shadow-[0_0_0_1.5px_rgba(255,255,255,.6),0_0_12px_rgba(30,130,76,.7)]',
  contested: 'shadow-[0_0_0_1.5px_rgba(255,255,255,.6),0_0_12px_rgba(183,87,0,.7)]',
  rejected: 'shadow-[0_0_0_1.5px_rgba(255,255,255,.6),0_0_12px_rgba(104,51,255,.7)]',
};
const FAR_MARKERS: Partial<Record<GraphNode['kind'], string>> = {
  topic: 'h-2 w-4 rounded-full bg-grey-03',
  story: 'h-3 w-3 rounded-[3px] bg-grey-01',
  event: cx(FAR_SQUARE, 'shadow-[inset_0_0_0_2px_#f2f2f2]'),
  case: 'h-[14px] w-[14px] rounded-[3px] bg-[#4c8dff] shadow-[0_0_10px_rgba(76,141,255,.7)]',
  src: 'h-3 w-[10px] rounded-[2px] border-[1.5px] border-dashed border-white/70',
  // A far entity with no picture: a neutral dot, round like the photo it stands in for.
  ent: 'h-3 w-3 rounded-full bg-grey-03',
  other: 'h-3 w-3 rounded-full bg-grey-03',
};

/**
 * The centre's mark, whatever its kind: the prototype's Geo glow, a 2px white ring with a slow white
 * pulse around it. It's an animated box-shadow, and an animation outranks the band and card shadows
 * it sits on. With reduced motion it holds its first frame, so the ring stays and only the pulse stops.
 */
export const CENTRE_RING = 'animate-graph-centre-glow motion-reduce:[animation-play-state:paused]';

type CardProps = { node: GraphNode; hop: 0 | 1 | 2; isCentre: boolean; phone: boolean };

const LABEL = 'text-[12px] font-medium leading-[1.3]';
const DARK_CARD =
  'bg-[rgba(28,28,32,.86)] text-[#f2f2f2] shadow-[inset_0_0_0_1px_rgba(255,255,255,.16),0_10px_30px_rgba(0,0,0,.45)]';

/**
 * How many lines a card's name gets. On a phone the centre gets four, so most names show whole
 * without a long claim filling the middle of the map. The panel below leaves the name out on a
 * phone (GEO-3849), so a name past four lines shows whole only on its own page.
 */
function labelClamp(
  { isCentre, phone }: Pick<CardProps, 'isCentre' | 'phone'>,
  lines: 'line-clamp-2' | 'line-clamp-3'
) {
  return isCentre && phone ? 'line-clamp-4' : lines;
}

/**
 * Label size: larger for the centre, the design's 11px for far nodes. On a phone every other node
 * is a pin or a marker, so only the centre is a card there.
 */
function labelSize({ isCentre, phone, hop }: Pick<CardProps, 'isCentre' | 'phone' | 'hop'>) {
  if (isCentre) return cx('font-semibold', phone ? 'text-[13px]' : 'text-[14px]');
  return hop === 2 ? 'text-[11px]' : null;
}

/** What a node looks like, by kind. Claims read their space-scoped counts (`claimSpaceId`). */
export function NodeCard({
  claimSpaceId,
  centreId = null,
  ...props
}: CardProps & { claimSpaceId: string | null; centreId?: string | null }) {
  if (props.node.kind === 'claim' && claimSpaceId) return <ClaimCard {...props} spaceId={claimSpaceId} />;
  if (props.node.kind === 'ent' || props.node.kind === 'other') return <EntityCard {...props} centreId={centreId} />;
  return (
    <Placed {...props}>
      {props.node.kind === 'topic' ? <TopicCard {...props} /> : <ItemCard {...props} centreId={centreId} />}
    </Placed>
  );
}

/**
 * Where a card sits decides its form: far nodes are a marker, hop 1 shrinks to one (on a phone it is
 * a pin), the centre is the card.
 */
function Placed({
  node,
  hop,
  isCentre,
  phone,
  children,
}: Pick<CardProps, 'node' | 'hop' | 'isCentre' | 'phone'> & { children: React.ReactNode }) {
  if (isPhonePin(phone, hop, isCentre))
    return <PhonePin marker={<PinMarker node={node} band={null} />} name={node.name} />;
  const marker = <FarMarker node={node} band={null} />;
  if (isFarNode(hop, isCentre)) return marker;
  return isCentre ? children : <ShrinksToMarker marker={marker}>{children}</ShrinksToMarker>;
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

/**
 * A hop-1 node on a phone (GEO-3864): its marker, which the map scales with depth through
 * `--pin-scale`, over its name at a fixed size, so the name reads however far back the node sits.
 * `--pin-shift` slides the name in from a stage edge. The map fades a covered name through `--pin-label` and sets `data-covered` on the button, which
 * then takes taps on the marker only.
 */
function PhonePin({ marker, name }: { marker: React.ReactNode; name: string | null }) {
  return (
    <span data-phone-pin className="flex w-max max-w-[108px] flex-col items-center gap-1 text-center">
      <span
        data-anchor
        className="flex [scale:var(--pin-scale,1)] items-center justify-center p-1 group-data-[covered]:pointer-events-auto"
      >
        {marker}
      </span>
      <span
        data-label
        className="[translate:var(--pin-shift,0px)_0] rounded-md bg-[rgba(20,20,23,.8)] px-[6px] py-[2px] text-[#f2f2f2] opacity-[var(--pin-label,1)] shadow-[0_0_0_1px_rgba(255,255,255,.1)]"
      >
        <span className={cx(LABEL, 'line-clamp-2')}>{name}</span>
      </span>
    </span>
  );
}

/** A pin's marker: the far marker's shape, without its hover name (the pin shows the name). */
function PinMarker({ node, band }: { node: GraphNode; band: ClaimBand | null }) {
  return <span aria-hidden className={cx('block', farMarkerClass(node.kind, band))} />;
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
function TopicCard({ node, isCentre, phone }: CardProps) {
  if (!isCentre)
    return (
      <span
        data-label
        className="block max-w-[170px] rounded-full bg-grey-05 px-[10px] py-1 text-center text-grey-02 shadow-[0_0_0_1px_rgba(255,255,255,.1)]"
      >
        <span className={cx(LABEL, 'line-clamp-2 text-[11px]')}>{node.name}</span>
      </span>
    );
  return (
    <span
      data-label
      className={cx(
        'block rounded-full bg-white text-center text-[#151515]',
        CENTRE_RING,
        phone ? 'max-w-[200px] px-3 py-[6px]' : 'max-w-[260px] px-5 py-[10px]'
      )}
    >
      {/* Geo sets the centre topic in medium (LABEL's weight), not the semibold other centres use. */}
      <span
        className={cx(LABEL, labelClamp({ isCentre, phone }, 'line-clamp-2'), phone ? 'text-[13px]' : 'text-[14px]')}
      >
        {node.name}
      </span>
    </span>
  );
}

/**
 * An entity with a picture is its photo plus a name label. With none, or once the picture fails to
 * load, it is a name card like the map's other cards: a letter in a gray circle says nothing.
 */
function EntityCard({ centreId, ...props }: CardProps & { centreId: string | null }) {
  const src = entityImageSrc(props.node);
  // Keyed by URL, so a node whose picture changes tries the new one.
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  if (src && failedSrc !== src) return <EntityPhotoCard {...props} src={src} onError={() => setFailedSrc(src)} />;
  return (
    <Placed {...props}>
      <ItemCard {...props} centreId={centreId} />
    </Placed>
  );
}

function EntityPhotoCard({
  node,
  hop,
  isCentre,
  phone,
  src,
  onError,
}: CardProps & { src: string; onError: () => void }) {
  if (isPhonePin(phone, hop, isCentre))
    return (
      <PhonePin
        marker={
          <span className="block h-7 w-7 overflow-hidden rounded-full bg-[#333] shadow-[0_0_0_1px_rgba(255,255,255,.3)]">
            <img src={src} alt="" draggable={false} className="h-full w-full object-cover" onError={onError} />
          </span>
        }
        name={node.name}
      />
    );
  const far = isFarNode(hop, isCentre);
  const size = isCentre ? (phone ? 64 : 84) : far ? 30 : 52;
  const width = isCentre ? (phone ? 'w-[110px]' : 'w-[150px]') : far ? null : 'w-[112px]';
  return (
    <span className={cx('relative flex flex-col items-center gap-1 text-center', width)}>
      <span
        data-anchor
        className={cx(
          'flex shrink-0 items-center justify-center overflow-hidden bg-[#333]',
          // Far, Geo draws the photo as a 30px rounded square with a faint white ring.
          far ? 'rounded-[8px]' : 'rounded-full',
          isCentre
            ? CENTRE_RING
            : far
              ? 'shadow-[0_0_0_1px_rgba(255,255,255,.3)]'
              : 'shadow-[0_0_0_1px_rgba(255,255,255,.18),0_10px_30px_rgba(0,0,0,.5)]'
        )}
        style={{ width: size, height: size }}
      >
        <img src={src} alt="" draggable={false} className="h-full w-full object-cover" onError={onError} />
      </span>
      {far ? (
        <FarName name={node.name} />
      ) : (
        <span
          data-label
          className={cx(
            LABEL,
            labelClamp({ isCentre, phone }, 'line-clamp-2'),
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
  src: 'border border-dashed border-white/30 bg-[rgba(30,30,33,.86)] text-[#f2f2f2] shadow-[0_8px_24px_rgba(0,0,0,.35)]',
  case: 'bg-[rgba(28,28,32,.86)] text-[#f2f2f2] shadow-[inset_3px_0_0_#4c8dff,inset_0_0_0_1px_rgba(255,255,255,.16),0_10px_30px_rgba(0,0,0,.45)]',
};

/** Card width and padding for items and claims, by place and screen. */
function cardBox({ isCentre, phone }: Pick<CardProps, 'isCentre' | 'phone'>, desktop: [string, string]) {
  if (phone) return 'w-[170px] p-2';
  return cx('px-3 py-[10px]', isCentre ? desktop[0] : desktop[1]);
}

/**
 * A source's (and news') box, in the prototype's Geo geometry: smaller and squarer than the other cards. Phone
 * keeps the shared phone box, which the map's spacing on a small screen is tuned to.
 */
function sourceBox({ isCentre, phone }: Pick<CardProps, 'isCentre' | 'phone'>) {
  if (phone) return cx('rounded-[10px]', cardBox({ isCentre, phone }, ['', '']));
  return cx('rounded-[10px] px-[11px] py-[9px]', isCentre ? 'w-[220px]' : 'w-[168px]');
}

/**
 * The other cards' box (names, events, cases), in the prototype's Geo geometry: roomier than a
 * claim's, with more space between the eyebrow and the title.
 */
function itemBox({ isCentre, phone }: Pick<CardProps, 'isCentre' | 'phone'>) {
  if (phone) return 'gap-[6px] rounded-xl w-[176px] p-[14px]';
  return cx('gap-[10px] rounded-xl', isCentre ? 'w-[240px] px-5 py-[18px]' : 'w-[184px] px-4 py-[14px]');
}

function ItemCard({ node, hop, isCentre, phone, centreId }: CardProps & { centreId: string | null }) {
  const source = node.kind === 'src';
  const named = node.kind === 'ent' || node.kind === 'other';
  // Geo draws news like a source: the smaller, squarer card.
  const small = source || node.kind === 'story';
  const meta = source
    ? sourceEyebrow(node, centreId)
    : [nodeTypeLabel(node), nodeDateLabel(node)].filter(Boolean).join(' · ');
  return (
    <span
      data-label
      data-source-card={source || undefined}
      data-name-card={named || undefined}
      className={cx(
        // Blur behind every card is too much for low-end phones.
        'flex flex-col items-start text-left',
        !phone && 'backdrop-blur-[6px]',
        ITEM_STYLES[node.kind] ?? DARK_CARD,
        isCentre && CENTRE_RING,
        small ? cx('gap-1', sourceBox({ isCentre, phone })) : itemBox({ isCentre, phone })
      )}
    >
      {meta && (
        <span
          className={cx(
            'text-[11px]',
            source
              ? 'line-clamp-1 font-normal text-[#a8a8a8]'
              : named
                ? 'line-clamp-1 font-medium text-[#a8a8a8]'
                : cx('font-medium', node.kind === 'story' ? 'text-[#4b4b4b]' : 'text-[#d9b46a]')
          )}
        >
          {meta}
        </span>
      )}
      <span className={cx(LABEL, labelClamp({ isCentre, phone }, 'line-clamp-3'), labelSize({ isCentre, phone, hop }))}>
        {node.name}
      </span>
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
  if (isPhonePin(phone, hop, isCentre))
    return (
      <span data-band={state} className="contents">
        <PhonePin marker={<PinMarker node={node} band={band} />} name={node.name} />
      </span>
    );
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
      <span
        className={cx(
          LABEL,
          labelClamp({ isCentre, phone }, phone ? 'line-clamp-2' : 'line-clamp-3'),
          labelSize({ isCentre, phone, hop })
        )}
      >
        {node.name}
      </span>
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
