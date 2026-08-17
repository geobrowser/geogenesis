import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';
import { notFound } from 'next/navigation';

import { bountiesEnabledForNetwork } from '~/core/bounties/config';
import { isBountySpace } from '~/core/bounties/constants';
import { toBoardBounty } from '~/core/bounties/fetch-bounties';
import { BOUNTY_TYPE_ID } from '~/core/bounties/ontology';
import { getEntity } from '~/core/io/queries';

import { BountyForm } from '~/partials/bounties/bounty-form';

type Props = {
  params: Promise<{ id: string; bountyId: string }>;
};

export default async function EditBountyPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id) || !IdUtils.isValid(params.bountyId)) notFound();
  if (!bountiesEnabledForNetwork || !isBountySpace(params.id)) notFound();

  const entity = await Effect.runPromise(getEntity(params.bountyId, params.id));
  if (!entity || !entity.types.some(type => type.id === BOUNTY_TYPE_ID)) notFound();

  return (
    <BountyForm
      mode="edit"
      spaceId={params.id}
      initial={{ bounty: toBoardBounty(entity, params.id), relations: entity.relations }}
    />
  );
}
