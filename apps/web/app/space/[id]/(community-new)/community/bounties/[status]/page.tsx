import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { Suspense } from 'react';

import { notFound } from 'next/navigation';

import { isBountyStatusSlug } from '~/partials/community-tab/bounty-status';
import { BountiesStatusFullView } from '~/partials/community-tab/community-bounties-sections';

type Props = {
  params: Promise<{ id: string; status: string }>;
};

export default async function BountiesStatusPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id) || !isBountyStatusSlug(params.status)) {
    notFound();
  }

  return (
    <Suspense>
      <BountiesStatusFullView spaceId={params.id} status={params.status} />
    </Suspense>
  );
}
