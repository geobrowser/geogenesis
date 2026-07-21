'use client';

import cx from 'classnames';

import { RANKING_POINTS_UI_ENABLED } from '~/core/blocks/ranking/ranking-points';
import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useEntityMedia, useImageUrlFromEntity } from '~/core/utils/use-entity-media';
import { NavUtils } from '~/core/utils/utils';

import { ThumbGeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

const ROW_NAME_CLASS = 'block line-clamp-3 tracking-[-0.17px] text-text text-[19px] font-medium leading-[1.3]';
const ROW_DESCRIPTION_CLASS = 'break-words text-[16px] leading-[24px] text-grey-04';

/** Placeholder row shown while an entry's name/image resolve — rank is already known. */
export function RankingEntryRowSkeleton({ rank }: { rank?: number }) {
  const showLeadingRank = rank != null && rank > 0;

  return (
    <div className="flex w-full min-w-0 items-center gap-4 overflow-hidden">
      {showLeadingRank ? (
        <span className="w-5 shrink-0 text-center text-button font-medium text-text tabular-nums">{rank}</span>
      ) : null}
      <Skeleton className="h-16 min-h-16 w-16 min-w-16 shrink-0 rounded-md" />
      <div className="flex min-h-16 min-w-0 flex-1 flex-col justify-center gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}

type Props = {
  /** Omit or pass 0 to hide the rank indicator. */
  rank?: number;
  entry: RankingEntryDisplay;
  spaceId: string;
  imageUrl?: string | null;
  /** Aggregated Borda score — only rendered when `RANKING_POINTS_UI_ENABLED` (competition-linked). */
  score?: number;
  pending?: boolean;
  /** When false, the name is plain text (e.g. compose pick rows that navigate on row click). */
  linkToEntity?: boolean;
  /** `leading` = rank column left of avatar; `avatar-badge` = overlapping corner badge (default). */
  rankStyle?: 'leading' | 'avatar-badge';
};

export function RankingEntryRow({
  rank,
  entry,
  spaceId,
  imageUrl: imageUrlOverride,
  score,
  pending = false,
  linkToEntity = true,
  rankStyle = 'avatar-badge',
}: Props) {
  const { avatarUrl, coverUrl } = useEntityMedia(entry.entityId, spaceId);
  const imageHint = entry.image;
  const directIpfs =
    imageHint && typeof imageHint === 'string' && imageHint.startsWith('ipfs://') ? imageHint : undefined;
  const lookedUpFromHint = useImageUrlFromEntity(imageHint && !directIpfs ? imageHint : undefined, spaceId);
  const imageUrl = imageUrlOverride ?? directIpfs ?? lookedUpFromHint ?? avatarUrl ?? coverUrl;
  const href = NavUtils.toEntity(spaceId, entry.entityId);
  const showRank = rank != null && rank > 0;

  const effectiveRankStyle = imageUrl ? rankStyle : 'leading';
  const showLeadingRank = showRank && effectiveRankStyle === 'leading';

  const avatar = imageUrl ? (
    <div
      className="relative h-16 min-h-16 w-16 min-w-16 shrink-0 overflow-clip rounded-md bg-grey-02"
      data-ranking-image-value={imageUrl}
    >
      {showRank && effectiveRankStyle === 'avatar-badge' ? (
        <span className="absolute -top-1.5 -left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-text text-[11px] font-medium text-white ring-2 ring-white">
          {rank}
        </span>
      ) : null}
      <ThumbGeoImage key={imageUrl} value={imageUrl} className="object-cover" />
    </div>
  ) : null;

  return (
    <div className="flex w-full min-w-0 items-center gap-4 overflow-hidden">
      {showLeadingRank ? (
        <span className="w-5 shrink-0 text-center text-button font-medium text-text tabular-nums">{rank}</span>
      ) : null}
      {avatar}
      <div className={cx('flex min-w-0 flex-1 flex-col justify-center gap-1', imageUrl && 'min-h-16')}>
        {linkToEntity ? (
          <Link href={href} className={cx(ROW_NAME_CLASS, 'hover:underline')} title={entry.name}>
            {entry.name}
          </Link>
        ) : (
          <span className={ROW_NAME_CLASS} title={entry.name}>
            {entry.name}
          </span>
        )}
        {/* TODO(competition-points): Enable via RANKING_POINTS_UI_ENABLED when root competition points at this block. */}
        {RANKING_POINTS_UI_ENABLED && score != null ? (
          <p className="text-[12px] leading-[16px] text-grey-04">{score} points</p>
        ) : null}
        {entry.description ? (
          <div className={cx(ROW_DESCRIPTION_CLASS, 'line-clamp-2')} title={entry.description}>
            {entry.description}
          </div>
        ) : null}
        {pending ? <p className="text-[12px] leading-[16px] font-medium text-grey-04">Pending approval</p> : null}
      </div>
    </div>
  );
}
