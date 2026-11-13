'use client';

import * as React from 'react';

import cx from 'classnames';

import { debateAgeLabel } from '~/core/blocks/ranking/best-debate-display';
import type { BestDebateRowData } from '~/core/blocks/ranking/use-best-debate-displays';
import type { BlockRanker } from '~/core/blocks/ranking/use-block-rankers';
import { speakerStillContentUrl } from '~/core/debates/speaker-still';
import { normId } from '~/core/utils/norm-id';

import { Avatar } from '~/design-system/avatar';
import { GeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { SpaceThumb } from '~/partials/explore/space-thumb';

/**
 * The Best debates rows' display data, provided by the block and by the ranking screen for every
 * debate they show. Inside it, `RankingEntryRow` draws a debate as a `BestDebateRow`, so the
 * ranking screen's shared columns (team, yours, pushed down) need no Best-debates branch of their
 * own. Absent everywhere else, so no other ranking block changes.
 */
export const BestDebateDisplaysContext = React.createContext<ReadonlyMap<string, BestDebateRowData> | null>(null);

/**
 * Opens a debate to watch, from its poster (Preston, 12 Nov): provided by the block and the ranking
 * screen, which draw the watch dialog. Without it the poster is only a picture.
 */
export const BestDebateWatchContext = React.createContext<((entityId: string) => void) | null>(null);

export function useBestDebateRowData(entityId: string): BestDebateRowData | null | undefined {
  const displays = React.useContext(BestDebateDisplaysContext);
  if (!displays) return undefined;
  return displays.get(normId(entityId)) ?? null;
}

const PLAY_ICON = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor" />
  </svg>
);

/**
 * The debate's poster, in the portrait shape its video is (540 × 820, as the claim page's debate
 * rows draw it): the Key frame still when the debate has one, else geo-chat's first speaker still,
 * else a neutral tile. A play mark on top says it's a video.
 */
export function BestDebateThumb({
  entityId,
  keyframeUrl,
  label,
  className,
}: {
  entityId: string;
  keyframeUrl: string | null;
  /** The debate's title, for the Watch control's name. */
  label?: string;
  className?: string;
}) {
  const [stillFailed, setStillFailed] = React.useState(false);
  const watch = React.useContext(BestDebateWatchContext);
  // A span with a button's role rather than a <button>: the poster sits inside rows that are
  // buttons themselves, and a button may not hold another. Its press stops there, so the row's own
  // action (place it, open the side panel) doesn't run as well.
  const interactive = watch
    ? {
        role: 'button' as const,
        tabIndex: 0,
        'aria-label': `Watch ${label ?? 'this debate'}`,
        title: 'Watch',
        onClick: (event: React.MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          watch(entityId);
        },
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          watch(entityId);
        },
        onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
        draggable: false,
      }
    : { 'aria-hidden': true };
  return (
    <span
      className={cx(
        'relative grid aspect-[27/41] w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-grey-02',
        watch &&
          'cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-text',
        className
      )}
      data-testid="best-debate-thumb"
      {...interactive}
    >
      {keyframeUrl ? (
        <GeoImage value={keyframeUrl} alt="" fill sizes="48px" className="object-cover" />
      ) : !stillFailed ? (
        <img
          src={speakerStillContentUrl(entityId, 1)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setStillFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <span className="relative grid size-6 place-items-center rounded-full bg-black/55 text-white">{PLAY_ICON}</span>
    </span>
  );
}

/** Space chip · debaters · age, each left out when there's nothing behind it. */
export function BestDebateMeta({
  data,
  showSpace = true,
  showDebaters = true,
  showAge = true,
  className,
}: {
  data: BestDebateRowData | null | undefined;
  showSpace?: boolean;
  showDebaters?: boolean;
  showAge?: boolean;
  className?: string;
}) {
  if (!data) return null;
  const parts: React.ReactNode[] = [];
  if (showSpace && data.space) {
    parts.push(
      <span key="space" className="inline-flex min-w-0 items-center gap-1">
        <SpaceThumb image={data.space.image} name={data.space.name} />
        <span className="truncate">{data.space.name}</span>
      </span>
    );
  }
  if (showDebaters && data.debaters) parts.push(<span key="debaters">{data.debaters}</span>);
  const age = showAge ? debateAgeLabel(data.createdAtMs) : null;
  if (age) parts.push(<span key="age">{age}</span>);
  if (parts.length === 0) return null;
  return (
    <span
      className={cx('flex min-w-0 flex-wrap items-center gap-x-1.5 text-footnote text-grey-04', className)}
      data-testid="best-debate-meta"
    >
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <span aria-hidden>·</span> : null}
          {part}
        </React.Fragment>
      ))}
    </span>
  );
}

/** Overlapping avatars of the people who ranked a debate (the mockups' right column). */
export function RankerAvatars({ rankers, max = 3 }: { rankers: readonly BlockRanker[]; max?: number }) {
  if (rankers.length === 0) return null;
  const names = rankers.map(ranker => ranker.name).filter(Boolean);
  return (
    <span
      className="flex items-center"
      data-testid="best-debates-ranker-avatars"
      aria-label={`Ranked by ${names.length > 0 ? names.join(', ') : `${rankers.length}`}`}
      role="img"
    >
      {rankers.slice(0, max).map((ranker, index) => (
        <span
          key={`${ranker.fallbackSeed}-${index}`}
          className={cx('block size-4 overflow-hidden rounded-full ring-2 ring-white', index > 0 && '-ml-1')}
        >
          <Avatar avatarUrl={ranker.avatarUrl} value={ranker.fallbackSeed} size={16} />
        </span>
      ))}
    </span>
  );
}

/** Claim titles: one token on every Best debates surface (block, team, yours, Placed, compare). */
export const CLAIM_TITLE_CLASS = 'text-button text-text';
const TITLE_CLASS = cx('line-clamp-3', CLAIM_TITLE_CLASS);

type BestDebateRowProps = {
  entityId: string;
  /** What to call the debate until its claim is known. */
  fallbackName: string;
  data: BestDebateRowData | null | undefined;
  /** The leading place number; null draws a dash (the block's "Not ranked yet" rows). */
  rank?: number | null;
  /** Leave the rank column out altogether. */
  hideRank?: boolean;
  /** "Your ranking" and the Placed list have no poster (mockups 07, 13). */
  showThumb?: boolean;
  showDebaters?: boolean;
  /** Under the meta line (the To rank badge). */
  footer?: React.ReactNode;
  /** The right column: rankers and counts, or "You: #14". */
  aside?: React.ReactNode;
  titleClassName?: string;
  /** Makes the title a link (the block's rows, to the debate's page). */
  href?: string;
};

/**
 * A Best debates row as the mockups draw it: place, poster, the claim, then space · debaters · age.
 * Built from the claim page's debate row (portrait keyframe) and the ranking row's type scale.
 */
export function BestDebateRow({
  entityId,
  fallbackName,
  data,
  rank,
  hideRank = false,
  showThumb = true,
  showDebaters = true,
  footer,
  aside,
  titleClassName,
  href,
}: BestDebateRowProps) {
  const title = data?.title ?? fallbackName;
  return (
    <div className="flex w-full min-w-0 items-center gap-4" data-testid="best-debate-row" data-entity-id={entityId}>
      {hideRank ? null : (
        <span
          className={cx(
            'w-5 shrink-0 text-center text-button tabular-nums',
            rank == null ? 'text-grey-03' : 'text-text'
          )}
          aria-hidden={rank == null}
        >
          {rank == null ? '–' : rank}
        </span>
      )}
      {showThumb ? <BestDebateThumb entityId={entityId} keyframeUrl={data?.keyframeUrl ?? null} label={title} /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {href ? (
          <Link href={href} className={cx(TITLE_CLASS, 'hover:underline', titleClassName)}>
            {title}
          </Link>
        ) : (
          <span className={cx(TITLE_CLASS, titleClassName)}>{title}</span>
        )}
        <BestDebateMeta data={data} showDebaters={showDebaters} />
        {footer}
      </div>
      {aside ? <div className="flex shrink-0 items-center gap-1.5">{aside}</div> : null}
    </div>
  );
}
