import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { CommunityTabPage } from '~/partials/community-tab/community-tab-page';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CommunityPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  return <CommunityTabPage spaceId={params.id} />;
}
