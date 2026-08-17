import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { bountiesEnabledForNetwork } from '~/core/bounties/config';
import { isBountySpace } from '~/core/bounties/constants';

import { BountyForm } from '~/partials/bounties/bounty-form';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function NewBountyPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) notFound();
  if (!bountiesEnabledForNetwork || !isBountySpace(params.id)) notFound();

  return <BountyForm mode="create" spaceId={params.id} />;
}
