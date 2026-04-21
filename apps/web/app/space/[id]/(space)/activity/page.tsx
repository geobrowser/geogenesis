import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { ActivityFeedPage } from '~/partials/activity/activity-feed-page';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Activity(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  return <ActivityFeedPage spaceId={params.id} />;
}
