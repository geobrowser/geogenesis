import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { NavUtils } from '~/core/utils/utils';

import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { CuratorLeaderboardSection } from '~/partials/community-tab/curator-leaderboard-section';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CommunityLeaderboardPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8">
      <Link
        href={NavUtils.toCommunity(params.id)}
        className="flex w-fit items-center gap-2 text-metadata text-grey-04 transition-colors hover:text-text"
      >
        <ArrowLeft color="grey-04" />
        Community
      </Link>

      <CuratorLeaderboardSection spaceId={params.id} expanded />
    </div>
  );
}
