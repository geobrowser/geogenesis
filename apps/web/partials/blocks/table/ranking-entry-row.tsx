'use client';

import cx from 'classnames';
import NextImage from 'next/image';

import { RANKING_POINTS_UI_ENABLED } from '~/core/blocks/ranking/ranking-points';
import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useEntityMediaUrl, useImageUrlFromEntity } from '~/core/utils/use-entity-media';
import { NavUtils } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

const ROW_AVATAR_SIZE_PX = 64;

const ROW_NAME_CLASS =
  'block truncate tracking-[-0.17px] text-text text-[19px] font-medium leading-[1.3]';
const ROW_DESCRIPTION_CLASS = 'break-words text-[16px] leading-[24px] text-grey-04';

type Props = {
  /** Omit or pass 0 to hide the rank indicator. */
  rank?: number;
  entry: RankingEntryDisplay;
  spaceId: string;
  /** Aggregated Borda score — only rendered when `RANKING_POINTS_UI_ENABLED` (competition-linked). */
  score?: number;
  /** When false, the name is plain text (e.g. compose pick rows that navigate on row click). */
  linkToEntity?: boolean;
  /** `leading` = rank column left of avatar; `avatar-badge` = overlapping corner badge (default). */
  rankStyle?: 'leading' | 'avatar-badge';
};

export function RankingEntryRow({
  rank,
  entry,
  spaceId,
  score,
  linkToEntity = true,
  rankStyle = 'avatar-badge',
}: Props) {
  const mediaUrl = useEntityMediaUrl(entry.entityId, spaceId);
  const imageHint = entry.image;
  const directIpfs =
    imageHint && typeof imageHint === 'string' && imageHint.startsWith('ipfs://') ? imageHint : undefined;
  const lookedUpFromHint = useImageUrlFromEntity(imageHint && !directIpfs ? imageHint : undefined, spaceId);
  const imageUrl = mediaUrl ?? directIpfs ?? lookedUpFromHint;
  const href = NavUtils.toEntity(spaceId, entry.entityId);
  const showRank = rank != null && rank > 0;
  const showLeadingRank = showRank && rankStyle === 'leading';

  const avatar = (
    <div className="relative h-16 min-h-16 w-16 min-w-16 shrink-0 overflow-clip rounded-md bg-grey-02">
      {showRank && rankStyle === 'avatar-badge' ? (
        <span className="absolute -top-1.5 -left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-text text-[11px] font-medium text-white ring-2 ring-white">
          {rank}
        </span>
      ) : null}
      {imageUrl ? (
        <GeoImage value={imageUrl} alt="" fill sizes={`${ROW_AVATAR_SIZE_PX}px`} className="object-cover" />
      ) : (
        <NextImage
          src={PLACEHOLDER_SPACE_IMAGE}
          alt=""
          fill
          sizes={`${ROW_AVATAR_SIZE_PX}px`}
          className="object-cover"
        />
      )}
    </div>
  );

  return (
    <div className="flex w-full min-w-0 items-center gap-4 overflow-hidden">
      {showLeadingRank ? (
        <span className="w-5 shrink-0 text-center text-button font-medium text-text tabular-nums">{rank}</span>
      ) : null}
      {avatar}
      <div className="flex min-h-16 min-w-0 flex-1 flex-col justify-center gap-1">
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
      </div>
    </div>
  );
}
