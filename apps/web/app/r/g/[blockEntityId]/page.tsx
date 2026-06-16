import type { Metadata } from 'next';

import { notFound } from 'next/navigation';

import { buildGlobalRankingMetadata } from '~/core/blocks/ranking/ranking-og-metadata';
import { buildShortGlobalRankingSharePath } from '~/core/blocks/ranking/ranking-share';
import { resolveGlobalRankingShare } from '~/core/blocks/ranking/resolve-ranking-share';

import { RankingComposeClientPage } from '~/app/space/(entity)/[id]/[entityId]/ranking-compose/ranking-compose-client-page';

type Props = {
  params: Promise<{ blockEntityId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { blockEntityId } = await params;
  const resolved = await resolveGlobalRankingShare(blockEntityId);
  if (!resolved) return {};

  const siteUrl = new URL(process.env.ENV_URL ?? 'https://geobrowser.io');
  return buildGlobalRankingMetadata(resolved, siteUrl, buildShortGlobalRankingSharePath(blockEntityId));
}

export default async function ShortGlobalRankingPage({ params }: Props) {
  const { blockEntityId } = await params;
  const resolved = await resolveGlobalRankingShare(blockEntityId);
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
      initialGlobalRanking={{
        rankingName: resolved.rankingName,
        orderedEntityIds: resolved.orderedEntityIds,
        entries: resolved.entries,
      }}
    />
  );
}
