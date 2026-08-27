import type { Metadata } from 'next';

import { notFound } from 'next/navigation';

import { buildPersonalRankingMetadata } from '~/core/blocks/ranking/ranking-og-metadata';
import { buildShortPersonalRankingSharePath } from '~/core/blocks/ranking/ranking-share';
import { resolvePersonalRankingShare } from '~/core/blocks/ranking/resolve-ranking-share';

import { RankingComposeClientPage } from '~/app/space/(entity)/[id]/[entityId]/ranking-compose/ranking-compose-client-page';

type Props = {
  params: Promise<{ rankEntityId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { rankEntityId } = await params;
  const resolved = await resolvePersonalRankingShare(rankEntityId);
  if (!resolved) return {};

  const siteUrl = new URL(process.env.ENV_URL ?? 'https://geobrowser.io');
  return buildPersonalRankingMetadata(resolved, siteUrl, buildShortPersonalRankingSharePath(rankEntityId));
}

export default async function ShortPersonalRankingPage({ params }: Props) {
  const { rankEntityId } = await params;
  const resolved = await resolvePersonalRankingShare(rankEntityId);
  if (!resolved) notFound();

  return (
    <RankingComposeClientPage
      spaceId={resolved.blockEntitySpaceId}
      dataBlockEntityId={resolved.blockEntityId}
      relationId={resolved.relationId}
      parentEntityIdParam={resolved.parentEntityId}
      rankingStartDate={resolved.rankingStartDate}
      rankingEndDate={resolved.rankingEndDate}
      mode="view"
      rankEntityId={resolved.rankEntityId}
      authorSpaceId={resolved.authorSpaceId}
      ogVersion={resolved.ogVersion}
      initialSharedRanking={{
        rankingName: resolved.rankingName,
        orderedEntityIds: resolved.orderedEntityIds,
        entries: resolved.entries,
      }}
    />
  );
}
