'use client';

import * as React from 'react';

import { ActionSurfaceDiv, useActionContext } from '~/core/action-context-provider';
import { capture } from '~/core/analytics';
import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { toDebateGalleryModel } from '~/core/templates/adapters/debate-gallery-model';
import { DebateGalleryCard } from '~/core/templates/primitives/debate-gallery-card';

import { ExploreCardSurface } from '~/partials/explore/explore-card-chrome';

import type { DebateParticipantsPair } from '~/app/api/debates/participants/route';

/**
 * A debate in an Activity gallery, drawn as the Topic page's Recent debates card (GEO-3871).
 *
 * The card opens the debate page rather than playing in place, the way the Topic row does. It keeps
 * the feed card's attribution: the same `explore_feed_card` surface, so impressions and the open
 * still count against this gallery's list and position, with a variant naming the new card.
 */
export function GalleryDebateCard({
  item,
  participants,
  endSlot,
}: {
  item: ExploreFeedItem;
  /** The speakers' names, photos and stances, once the gallery's batch lookup answers. */
  participants: DebateParticipantsPair | undefined;
  /** A profile owner's control for this debate, drawn on the card outside its link. */
  endSlot?: React.ReactNode;
}) {
  const debate = React.useMemo(() => toDebateGalleryModel(item, participants), [item, participants]);

  return (
    <ExploreCardSurface item={item} variant="debate_gallery_card">
      <ActionSurfaceDiv className="w-full">
        <GalleryDebateCardBody debate={debate} entityId={item.entityId} endSlot={endSlot} />
      </ActionSurfaceDiv>
    </ExploreCardSurface>
  );
}

function GalleryDebateCardBody({
  debate,
  entityId,
  endSlot,
}: {
  debate: ReturnType<typeof toDebateGalleryModel>;
  entityId: string;
  endSlot?: React.ReactNode;
}) {
  // Read inside the surface, so the open carries its list, position and variant.
  const snapshot = useActionContext('explore_feed_card', 'entity', entityId);
  const recordOpen = React.useCallback(() => {
    try {
      capture('element_clicked', { ...snapshot(), source: 'explore_feed_card', element_action: 'open' });
    } catch {
      /* Optional telemetry. */
    }
  }, [snapshot]);

  return <DebateGalleryCard debate={debate} className="w-full" onOpen={recordOpen} action={endSlot} />;
}
