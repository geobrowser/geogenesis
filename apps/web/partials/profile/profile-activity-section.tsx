'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import type { Stance } from '~/core/profile/use-person-positions';
import { normId } from '~/core/utils/norm-id';
import { getImagePath } from '~/core/utils/utils';

import { FallbackImage } from '~/design-system/fallback-image';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SpacePillAvatar } from '~/design-system/space-pill';

import { ProfileEntityLink } from './profile-entity-link';

/** How many tiles a gallery holds before the reader is sent to the tab. */
const SHOWN = 6;

export type ActivityKind = {
  key: string;
  label: string;
  rows: ExploreFeedRow[];
  /** Which side this person took, by claim id. Claims only; debates have no stance. */
  stanceByClaimId?: Record<string, Stance>;
  /**
   * How many there are in total.
   *
   * Not `rows.length`, which is one page: the claims gallery read 20 where the
   * rail beside it said 192. Both now come from the rail's own counts.
   */
  total: number;
  isLoading: boolean;
  /** The tab holding the rest. */
  href: string;
  seeAllLabel: string;
};

/**
 * What this person has been doing lately, on Overview (GEO-2859).
 *
 * One card with a toggle rather than a section per kind. Debates and claims are
 * the same question asked twice — what have they argued about — and two
 * stacked galleries said they were different kinds of thing while burying the
 * history above them under a screen of tiles.
 *
 * Sideways rather than stacked because the full-width feed card is built to be
 * read one at a time. A tile says enough to decide whether to open it; the tab
 * behind "See all" is where the reading happens.
 */
export function ProfileActivitySection({ kinds }: { kinds: ActivityKind[] }) {
  const available = React.useMemo(() => kinds.filter(kind => kind.rows.length > 0), [kinds]);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  // Whichever the reader picked, or the first with anything in it. Held as a key
  // rather than an index so a kind arriving late — the two load separately —
  // cannot shift the selection out from under them.
  const selected = available.find(kind => kind.key === selectedKey) ?? available[0];

  // Nothing at all rather than an empty card. A heading over a blank space reads
  // as a page that failed to load, and most accounts have never been in a debate.
  if (kinds.some(kind => kind.isLoading) || available.length === 0 || !selected) return null;

  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-grey-02 bg-white">
      <header className="flex flex-col gap-3 border-b border-divider px-4 py-3">
        <h3 className="text-metadataMedium text-text">Activity</h3>

        {/* Only when there is a choice to make. One pill on its own is a label
            dressed up as a control. */}
        {available.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            {available.map(kind => {
              const isSelected = kind.key === selected.key;

              return (
                <button
                  key={kind.key}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedKey(kind.key)}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-smallButton transition-colors',
                    isSelected
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 text-grey-04 hover:border-text hover:text-text'
                  )}
                >
                  {kind.label}
                  <span className={cx('tabular-nums', isSelected ? 'text-white/70' : 'text-grey-03')}>
                    {kind.total.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      <ActivityGallery rows={selected.rows} stanceByClaimId={selected.stanceByClaimId} />

      <Link
        href={selected.href}
        className="flex items-center justify-center gap-2 border-t border-divider py-3 text-metadataMedium text-grey-04 transition-colors hover:text-text"
      >
        {selected.seeAllLabel}
        <RightArrowLongSmall />
      </Link>
    </section>
  );
}

function ActivityGallery({
  rows,
  stanceByClaimId,
}: {
  rows: ExploreFeedRow[];
  stanceByClaimId?: Record<string, Stance>;
}) {
  const shown = React.useMemo(() => rows.slice(0, SHOWN), [rows]);

  // Looked up once for the gallery. These are routinely spaces the viewer has
  // never opened, which the browse sidebar cannot name.
  const rowSpaceIds = React.useMemo(() => [...new Set(shown.map(row => row.spaceId))], [shown]);
  const { labelsById } = useSpaceLabels(rowSpaceIds);

  return (
    // `snap-x` so a flick lands on a tile rather than between two.
    //
    // The gap at either end is a spacer element rather than padding on the
    // scroller: a scroll container's trailing padding is dropped by every
    // browser that matters, so `p-4` gave 16px on the left and nothing on the
    // right. Spacers are honoured on both sides, and `scroll-px` keeps a snapped
    // tile off the edge it lands against.
    <div className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto py-4">
      <span aria-hidden className="w-0 shrink-0 pl-4" />
      {shown.map(row => (
        <ActivityTile
          key={`${row.entityId}-${row.spaceId}`}
          row={row}
          label={spaceLabel(labelsById, row.spaceId)}
          stance={stanceByClaimId?.[normId(row.entityId)]}
        />
      ))}
      <span aria-hidden className="w-0 shrink-0 pr-4" />
    </div>
  );
}

/**
 * One tile.
 *
 * A fixed width, narrow enough that the next one is visibly cut off — which is
 * what tells the reader the row scrolls, without a control saying so. It holds
 * its width on a phone too: tiles that shrink to fit stop being scannable, and
 * the row already scrolls.
 */
function ActivityTile({
  row,
  label,
  stance,
}: {
  row: ExploreFeedRow;
  label: SpaceLabel | undefined;
  stance: Stance | undefined;
}) {
  const spaceName = label?.name ?? row.spaceId.slice(0, 8);

  // A debate's video, and an image for everything else.
  //
  // These are two different things and were being drawn as one: a video URL fed
  // to `FallbackImage` renders an `<img>` pointing at an mp4, which is the grey
  // box every debate tile showed. The video is the debate's own first frame,
  // which is the small version of the player this wants to be.
  const videoUrl = row.debateVideoUrls[0];

  return (
    <article className="flex w-[232px] shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-grey-02">
      {videoUrl ? (
        <video
          // Metadata only: this is a still, not playback, and six tiles that
          // each pulled a whole video would cost more than the page under them.
          preload="metadata"
          muted
          playsInline
          disablePictureInPicture
          tabIndex={-1}
          aria-hidden
          className="aspect-video w-full bg-grey-01 object-cover"
          src={getImagePath(videoUrl)}
        />
      ) : row.imageUrl ? (
        <div className="relative aspect-video w-full overflow-hidden bg-grey-01">
          <FallbackImage value={row.imageUrl} sizes="232px" className="object-cover" />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
        <div className="flex min-w-0 items-center gap-1.5 text-breadcrumb text-grey-04">
          {label?.image ? <SpacePillAvatar value={label.image} /> : null}
          <span className="min-w-0 truncate">{spaceName}</span>
          {/* Which side they came down on — the thing you came to this profile
              to find out, and the reason a claim tile is worth reading at all
              when it is somebody else's. */}
          {stance && (
            <span
              className={cx(
                'ml-auto shrink-0 rounded-full border px-2 text-tag',
                stance === 'agree' ? 'border-green text-green' : 'border-red-01 text-red-01'
              )}
            >
              {stance === 'agree' ? 'Agree' : 'Disagree'}
            </span>
          )}
        </div>

        <ProfileEntityLink
          entityId={row.entityId}
          spaceId={row.spaceId}
          className="line-clamp-3 text-metadataMedium text-text hover:underline"
        >
          {row.title}
        </ProfileEntityLink>
      </div>
    </article>
  );
}
