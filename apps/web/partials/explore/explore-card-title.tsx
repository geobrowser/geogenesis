'use client';

import * as React from 'react';

import cx from 'classnames';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';

import { ExploreCardEntityLink } from './explore-card-entity-link';

/**
 * What heads an Explore card, and which entity that heading opens.
 *
 * One function because it is one decision, and a debate has two renditions that must not disagree:
 * `DebateExploreFeedCard` while the debate can be watched, and the generic card it falls back to
 * when it cannot. Those renditions swap *after* the card has painted — the geo-chat lookups behind
 * the decision are viewport-gated — so a per-rendition title would re-head a card under someone
 * mid-scroll, which is the thing reading the claim off the graph exists to avoid.
 *
 * A Debate is headed by the claim it argued rather than by its own name, which
 * `debate-publish-draft` generates as "<debater> vs. <debater> on <claim>" — the matchup first and
 * the motion buried at the end of a long line. The full-screen `/debates` feed has always headed a
 * debate with its claim; this is the same header, and it points at the same entity.
 *
 * Every other card is headed by its own name, unchanged: `debateClaim` is null on everything that
 * is not a debate.
 */
export function exploreCardHeading(item: ExploreFeedItem): {
  text: string;
  target: Pick<ExploreFeedItem, 'entityId' | 'spaceId' | 'types'>;
} {
  const claim = item.debateClaim;
  if (!claim) return { text: item.title, target: item };

  return {
    text: claim.name,
    target: {
      entityId: claim.entityId,
      spaceId: item.spaceId,
      // Typed as the Claim it is — which is also what keeps `ExploreCardEntityLink`'s
      // debates-always-navigate exception (GEO-2794) off it. That exception exists because a debate
      // is a full-screen video the side panel would serve badly; a claim is what the panel is for.
      types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }],
    },
  };
}

/**
 * The heading of an Explore card: the name, linked to whatever that name is naming.
 *
 * Its own module rather than a local in `explore-feed-card`, because the debate card renders the
 * same heading and importing it from there would close a cycle — `explore-feed-card` is what draws
 * the debate card in the first place.
 */
export function ExploreCardTitle({
  item,
  opensSidePanel,
  clamped = false,
}: {
  item: ExploreFeedItem;
  opensSidePanel: boolean;
  /**
   * Hold the heading to two lines, and hand the whole text back on hover for the times that cuts
   * it. One flag rather than a `className`, because the clamp and the tooltip are one decision:
   * a heading that can be cut needs a way to read the rest, and a heading that cannot must not
   * grow a tooltip that says what is already on screen.
   *
   * Only the debate card asks for it. That card sizes fixed aspect-ratio media from the height its
   * title leaves over, so a third line is height it did not budget for; every other card lets the
   * name run.
   */
  clamped?: boolean;
}) {
  const { text, target } = exploreCardHeading(item);

  return (
    <ExploreCardEntityLink item={target} opensSidePanel={opensSidePanel}>
      <h2
        title={clamped ? text : undefined}
        className={cx(
          'mt-0! text-[19px]! leading-[23px]! font-semibold! tracking-[-0.02em] text-text hover:underline',
          clamped && 'line-clamp-2'
        )}
      >
        {text}
      </h2>
    </ExploreCardEntityLink>
  );
}
