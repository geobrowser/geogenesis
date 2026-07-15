'use client';

import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';

import { useBlockExploreFeedItem } from './use-block-explore-feed-item';

type Props = {
  entityId: string;
  entitySpaceId: string;
  blockSpaceId: string;
  entry: RankingEntryDisplay;
};

export function RankingExploreFeedCard({ entityId, entitySpaceId, blockSpaceId, entry }: Props) {
  const item = useBlockExploreFeedItem({
    rowEntityId: entityId,
    entitySpaceId,
    blockSpaceId,
    titleOverride: entry.name,
    descriptionOverride: entry.description,
    imageHintOverride: entry.image,
    isMemberOrEditor: true,
  });
  const hideSpaceLink = entitySpaceId === blockSpaceId;

  return <ExploreFeedCard item={item} hideSpaceLink={hideSpaceLink} hideJoinButton />;
}
