import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { fetchCommunityCalls } from '~/core/community-calls/fetch-community-calls';

import { CommunityCallsPage } from '~/partials/community-calls/community-calls-page';

import { cachedFetchSpace } from '../../cached-fetch-space';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CommunityCalls(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  const [space, series] = await Promise.all([cachedFetchSpace(params.id), fetchCommunityCalls(params.id)]);

  return <CommunityCallsPage spaceId={params.id} spaceName={space?.entity?.name ?? 'this space'} series={series} />;
}
