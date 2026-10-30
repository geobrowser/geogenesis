'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { FollowButton } from '~/core/follows/follow-button';
import { useIsPersonalSpace } from '~/core/hooks/use-is-personal-space';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { RANKING_BLOCK_TYPE_ID } from '~/core/ranking-block-ids';
import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ExploreJoinSpaceButton } from './explore-join-space-button';
import { ExploreTypeTag } from './explore-type-tag';
import { MetaDot } from './meta-dot';
import { SpaceThumb } from './space-thumb';

const RANKING_BLOCK_TYPE = normId(RANKING_BLOCK_TYPE_ID);

/**
 * The type of one metadata segment.
 *
 * Exported because the topic card draws a second line of metadata under the description and it has
 * to be the same type as this row. Spelling it out there instead is precisely how the claim card's
 * copy of this row lost `font-normal` on three segments without any diff showing it.
 */
export const META_SEGMENT_CLASS = 'text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04';

/**
 * The line above every explore card: the space and what the thing is.
 *
 * One component because two card types draw it and a third could. It was copied rather than shared
 * when the claim card was written, and the copy did not survive contact: the segments ended up a
 * different distance apart, three of them lost `font-normal`, and a `min-h` added to reserve room
 * for the end slot held every claim card eight pixels taller than the cards either side of it.
 * None of that is visible in a diff of the two files — it took reading them class by class, twice.
 *
 * The dots live between segments rather than as a `gap`, because a segment that is absent must not
 * leave a separator behind: a claim that is not Controversial ends after its type, not after a dot.
 */
export function ExploreMetaRow({
  item,
  hideSpaceLink = false,
  hideJoinButton = false,
  extraSegments,
  endSlot,
  className,
  compact = false,
}: {
  item: ExploreFeedItem;
  hideSpaceLink?: boolean;
  hideJoinButton?: boolean;
  /**
   * Segments this card adds, placed after the types.
   *
   * Where a claim card puts Controversial — beside what kind of thing this is, which is the same
   * question, rather than down in the verdict where it would read as part of the number.
   */
  extraSegments?: React.ReactNode[];
  /**
   * Pinned to the end of the row with `ml-auto`, outside the dotted run.
   *
   * The claim card's offer, which is an action rather than another fact about the claim — so it
   * takes no dot before it.
   */
  endSlot?: React.ReactNode;
  className?: string;
  /**
   * Keep only the space, actions and caller-supplied segments, in the debates card's smaller header.
   *
   * At every width: it was phone-only once, and the claim card drew a second, larger header on
   * desktop. The two widths now share one card (GEO-3542).
   */
  compact?: boolean;
}) {
  // Deduped by normalized id and named only where the type has a name — an unnamed one renders as a
  // raw id, which says less than nothing.
  const types = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const type of item.types) {
      if (!type.name) continue;
      const key = normId(type.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: type.id, name: key === RANKING_BLOCK_TYPE ? 'Ranking' : type.name });
    }
    return out;
  }, [item.types]);

  const allSegments: { key: string; content: React.ReactNode; showWhenCompact: boolean }[] = [];

  const offer = useSpaceOffer(item, { hidden: hideJoinButton });
  if (offer.shown) {
    allSegments.push({
      key: 'join',
      // Joining is behaviour, not metadata. Compacting the row must never remove an action the
      // ordinary Explore card offers; only the type disappears.
      showWhenCompact: true,
      content: offer.shown,
    });
  }

  if (types.length > 0) {
    allSegments.push({
      key: 'types',
      showWhenCompact: false,
      content: (
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
          {types.map(type => (
            <ExploreTypeTag key={type.id} className="truncate">
              {type.name}
            </ExploreTypeTag>
          ))}
        </span>
      ),
    });
  }

  extraSegments?.forEach((content, index) => {
    allSegments.push({ key: `extra-${index}`, content, showWhenCompact: true });
  });

  const segments = compact ? allSegments.filter(segment => segment.showWhenCompact) : allSegments;

  const showSpace = !hideSpaceLink;
  if (!showSpace && segments.length === 0 && !endSlot) return null;

  const metadata = (
    <>
      {showSpace ? (
        <Link
          href={NavUtils.toSpace(item.spaceId)}
          className={cx(
            // `font-normal` in both: `text-footnoteMedium` carries a 500 weight of its own.
            'flex min-w-0 items-center gap-1.5 font-normal hover:underline',
            compact
              ? 'text-footnoteMedium tracking-normal text-grey-04'
              : 'text-[14px] leading-[13px] tracking-[-0.35px] text-text'
          )}
        >
          <SpaceThumb
            image={item.spaceImage}
            name={item.spaceName}
            // Important, or `SpaceThumb`'s own `h-3 w-3` wins.
            className={compact ? 'size-4!' : undefined}
          />
          <span className="min-w-0 truncate">{item.spaceName}</span>
        </Link>
      ) : null}
      {/* A 6px spacer rather than a dot: the space is the row's subject, not one of its facts. */}
      {showSpace && segments.length > 0 ? <span className="w-1.5 shrink-0" /> : null}
      {segments.map((segment, index) => (
        <React.Fragment key={segment.key}>
          {index > 0 ? <MetaDot /> : null}
          {segment.content}
        </React.Fragment>
      ))}
    </>
  );

  return (
    <div
      className={cx('flex min-w-0 flex-wrap items-center gap-y-2', compact && 'claim-card-panel-header!', className)}
    >
      {compact ? (
        // Grouped so the end slot sits at the header's far edge, as it does on the debates card.
        <div className="flex min-w-0 flex-1 flex-wrap items-center">{metadata}</div>
      ) : (
        metadata
      )}
      {endSlot}
      {offer.mounted}
    </div>
  );
}

/**
 * What a card offers about the space it was posted in: Join for a shared space you're not in, Follow
 * for someone's personal space (GEO-3236), since nobody joins a person. Shared by every Explore meta
 * row, so a debate card offers what a claim card does.
 *
 * `shown` is the control to draw, or null. `mounted` is a Follow for your own personal space, which
 * draws nothing but must stay mounted: a follow pressed there while signed out is queued, and only a
 * mounted Follow can see, once you've signed in, that it was yourself and drop it. Unmounted, it
 * would wait in the queue for a control that never comes.
 *
 * The feed doesn't carry space types, so this asks whether the space is personal: one batched
 * request for every card on screen, cached per space for the session. Join draws until the answer
 * is in: nearly every card is in a shared space.
 */
export function useSpaceOffer(
  item: ExploreFeedItem,
  {
    hidden = false,
    joinVariant = 'compact',
  }: { hidden?: boolean; joinVariant?: React.ComponentProps<typeof ExploreJoinSpaceButton>['variant'] } = {}
): { shown: React.ReactNode; mounted: React.ReactNode } {
  const isPersonal = useIsPersonalSpace(item.spaceId, { enabled: !hidden });
  const { personalSpaceId } = usePersonalSpaceId();
  if (hidden) return { shown: null, mounted: null };

  if (isPersonal) {
    const follow = <FollowButton target={{ kind: 'person', id: item.spaceId, name: item.spaceName }} />;
    const isOwn = Boolean(personalSpaceId) && normId(personalSpaceId ?? '') === normId(item.spaceId);
    return isOwn ? { shown: null, mounted: follow } : { shown: follow, mounted: null };
  }
  if (item.isMemberOrEditor) return { shown: null, mounted: null };
  return {
    shown: (
      <ExploreJoinSpaceButton
        spaceId={item.spaceId}
        spaceName={item.spaceName}
        hasRequestedSpaceMembership={item.hasPendingMembershipRequest}
        variant={joinVariant}
        label="Join"
      />
    ),
    mounted: null,
  };
}
