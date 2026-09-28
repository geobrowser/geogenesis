'use client';

import * as React from 'react';

import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { NavUtils } from '~/core/utils/utils';

import { FallbackImage } from '~/design-system/fallback-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { EntityRowActions } from '~/partials/entity-page/entity-row-actions';

import { ExploreCardTitle } from './explore-card-title';
import { ExploreFeedCommentLink } from './explore-feed-comment-link';

/**
 * The parts of an explore card that every card type shares, as components rather than as a class
 * list to copy.
 *
 * Its own module for the reason {@link ExploreCardTitle} and {@link MetaDot} are: a second card
 * type needs the same chrome, and reaching into `explore-feed-card` for it would close a cycle the
 * moment that dispatcher ever draws the second type. Copying it instead is what this file exists
 * to prevent — the two existing copies of the meta row drifted on spacing and font weight without
 * either diff showing it.
 */

/** The card's own frame: its padding and the rule under it, cleared on the last card in a feed. */
export const EXPLORE_CARD_CLASS = 'flex flex-col gap-2 border-b border-divider py-4 last:border-b-0';

/** The vote and comment row every card body ends on. */
export function ExploreCardActions({ item }: { item: ExploreFeedItem }) {
  return (
    <EntityRowActions entityId={item.entityId} spaceId={item.spaceId} className="mt-1">
      <ExploreFeedCommentLink
        href={`${NavUtils.toEntity(item.spaceId, item.entityId)}#entity-comments`}
        count={item.commentCount}
      />
    </EntityRowActions>
  );
}

/**
 * The default body: thumbnail on the left, title and description beside it.
 *
 * The thumbnail navigates even where the title opens the side panel — a picture is not a heading,
 * and the panel is reached by the name.
 */
export function ExploreCardDefaultBody({
  item,
  actions,
  titleOpensSidePanel,
  compactTitle = false,
  meta,
}: {
  item: ExploreFeedItem;
  /** The vote / comment row, owned by the card so bodies render it identically. */
  actions: React.ReactNode;
  /** Threaded to the title only. The thumbnail beside it still navigates. */
  titleOpensSidePanel: boolean;
  compactTitle?: boolean;
  /**
   * A line of the card's own metadata, between the description and the actions.
   *
   * Only the topic card passes one — how much is attached to a topic is the thing that
   * distinguishes one from the next, and nothing else the generic body draws can say it. A slot
   * rather than a second copy of this body: the copy is what drifts.
   */
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      {item.imageUrl ? (
        <Link
          href={NavUtils.toEntity(item.spaceId, item.entityId)}
          className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-grey-01"
        >
          <FallbackImage value={item.imageUrl} sizes="120px" className="object-cover" />
        </Link>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <ExploreCardTitle
            item={item}
            opensSidePanel={titleOpensSidePanel}
            clamped={compactTitle}
            showFullTextOnHover={compactTitle}
          />
          {item.description ? (
            <p className="mt-1 line-clamp-2 text-[16px]! leading-[20px]! font-normal! tracking-[-0.03em] text-grey-04">
              {item.description}
            </p>
          ) : null}
        </div>

        {meta}
        {actions}
      </div>
    </div>
  );
}
