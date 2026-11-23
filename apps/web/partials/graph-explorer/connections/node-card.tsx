'use client';

import * as React from 'react';

import cx from 'classnames';

import { useClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { type ClaimBand, claimBand } from '~/core/graph-explorer/claim-band';
import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { GRAPH_KIND_TYPE_IDS } from '~/core/graph-explorer/graph-kinds';
import { normId } from '~/core/utils/norm-id';

import { entityImageSrc } from '../graph-canvas';

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

type CardProps = { node: GraphNode; hop: 0 | 1 | 2; isCentre: boolean };

const LABEL = 'line-clamp-2 text-[12px] font-medium leading-[1.3]';

/** What a node looks like, by kind. Claims read their space-scoped counts (`claimSpaceId`). */
export function NodeCard({ node, hop, isCentre, claimSpaceId }: CardProps & { claimSpaceId: string | null }) {
  if (node.kind === 'claim' && claimSpaceId)
    return <ClaimCard node={node} hop={hop} isCentre={isCentre} spaceId={claimSpaceId} />;
  if (node.kind === 'ent') return <EntityCard node={node} hop={hop} isCentre={isCentre} />;
  if (node.kind === 'topic') return <TopicCard node={node} hop={hop} isCentre={isCentre} />;
  return <ItemCard node={node} hop={hop} isCentre={isCentre} />;
}

function TopicCard({ node, isCentre }: CardProps) {
  return (
    <span
      className={cx(
        'block rounded-full bg-white px-[18px] py-[10px] text-center text-[#151515] shadow-[0_0_0_6px_rgba(255,255,255,.07),0_0_44px_rgba(255,255,255,.22)]',
        isCentre ? 'max-w-[260px]' : 'max-w-[200px]'
      )}
    >
      <span className={cx(LABEL, 'font-semibold', isCentre && 'text-[14px]')}>{node.name}</span>
    </span>
  );
}

function EntityCard({ node, hop, isCentre }: CardProps) {
  const src = entityImageSrc(node);
  const [failed, setFailed] = React.useState(false);
  const size = isCentre ? 84 : hop === 2 ? 28 : 52;
  return (
    <span
      className={cx(
        'flex flex-col items-center gap-1 text-center',
        isCentre ? 'w-[150px]' : hop === 2 ? 'w-[96px]' : 'w-[112px]'
      )}
    >
      <span
        data-anchor
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#333] text-[#ddd] shadow-[0_0_0_1px_rgba(255,255,255,.18),0_10px_30px_rgba(0,0,0,.5)]"
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
      <span
        className={cx(
          LABEL,
          'rounded-md bg-white px-2 py-[2px] text-[#151515]',
          isCentre && 'text-[14px] font-semibold',
          hop === 2 && 'text-[11px]'
        )}
      >
        {node.name}
      </span>
    </span>
  );
}

const ITEM_STYLES: Record<string, string> = {
  story: 'bg-[rgba(246,246,246,.96)] text-[#151515]',
  case: 'bg-[rgba(28,28,32,.86)] text-[#f2f2f2] shadow-[inset_3px_0_0_#4c8dff,inset_0_0_0_1px_rgba(255,255,255,.16),0_10px_30px_rgba(0,0,0,.45)]',
  default:
    'bg-[rgba(28,28,32,.86)] text-[#f2f2f2] shadow-[inset_0_0_0_1px_rgba(255,255,255,.16),0_10px_30px_rgba(0,0,0,.45)]',
};

function ItemCard({ node, hop, isCentre }: CardProps) {
  const meta = [nodeTypeLabel(node), nodeDateLabel(node)].filter(Boolean).join(' · ');
  if (hop === 2 && !isCentre) {
    return (
      <span className="block w-[140px] rounded-lg bg-[rgba(28,28,32,.7)] px-2 py-1 text-left text-[#f2f2f2]">
        <span className="line-clamp-2 text-[11px] leading-[1.3]">{node.name}</span>
      </span>
    );
  }
  return (
    <span
      className={cx(
        'flex flex-col items-start gap-1 rounded-xl px-3 py-[10px] text-left backdrop-blur-[6px]',
        ITEM_STYLES[node.kind] ?? ITEM_STYLES.default,
        isCentre ? 'w-[230px]' : 'w-[176px]'
      )}
    >
      {meta && (
        <span className={cx('text-[11px] font-medium', node.kind === 'story' ? 'text-[#4b4b4b]' : 'text-[#d9b46a]')}>
          {meta}
        </span>
      )}
      <span className={cx(LABEL, 'line-clamp-3', isCentre && 'text-[13px] font-semibold')}>{node.name}</span>
    </span>
  );
}

function ClaimCard({ node, hop, isCentre, spaceId }: CardProps & { spaceId: string }) {
  const summary = useClaimResponseSummary(node.id, spaceId, 'stance');
  const ready = !summary.isLoading && summary.hasCounts;
  const band = ready ? claimBand(summary.positive, summary.negative) : null;
  const compact = hop === 2 && !isCentre;
  return (
    <span
      data-band={band ?? (ready ? 'none' : 'loading')}
      className={cx(
        'flex flex-col items-start gap-1 rounded-xl px-3 py-[10px] text-left transition-colors duration-300',
        band
          ? BAND_STYLES[band]
          : 'bg-[rgba(28,28,32,.86)] text-[#f2f2f2] shadow-[inset_0_0_0_1px_rgba(255,255,255,.16),0_10px_30px_rgba(0,0,0,.45)]',
        isCentre ? 'w-[260px]' : compact ? 'w-[150px] px-2 py-[6px]' : 'w-[200px]'
      )}
    >
      <span className={cx(LABEL, compact ? 'text-[11px]' : 'line-clamp-3', isCentre && 'text-[14px] font-semibold')}>
        {node.name}
      </span>
      {!compact &&
        (band && summary.percent !== null ? (
          <span className="flex w-full flex-col gap-1">
            <span className="text-[12px] font-medium">{summary.percent}% agree</span>
            <span className="block h-[3px] w-full overflow-hidden rounded-full bg-white/20">
              <span className="block h-full bg-white" style={{ width: `${summary.percent}%` }} />
            </span>
          </span>
        ) : (
          <ClaimStatusLine loading={summary.isLoading} answered={summary.hasCounts} />
        ))}
    </span>
  );
}

function ClaimStatusLine({ loading, answered }: { loading: boolean; answered: boolean }) {
  if (loading) return <span aria-hidden className="block h-[10px] w-16 animate-pulse rounded bg-white/10" />;
  return <span className="text-[11px] text-[#a8a8a8]">{answered ? 'No responses yet' : 'Responses unavailable'}</span>;
}
