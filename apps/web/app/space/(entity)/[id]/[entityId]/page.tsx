import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { fetchTopicClaimEligibility } from '~/core/io/subgraph/fetch-topic-claim-eligibility';
import { entityHasOnlyPostType } from '~/core/utils/entity/entities';

import { cachedFetchEntityPage } from './cached-fetch-entity';
import DefaultEntityPage from './default-entity-page';
import PostEntityPage from './post-entity-page';
import { ProfileEntityServerContainer } from './profile-entity-server-container';

interface Props {
  params: Promise<{ id: string; entityId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function EntityTemplateStrategy(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  if (!IdUtils.isValid(params.id) || !IdUtils.isValid(params.entityId)) {
    notFound();
  }

  const result = await cachedFetchEntityPage(params.entityId, params.id);

  // Claimable topics always render via DefaultEntityPage so the "Claim topic"
  // button on EntityPageHeader is visible — without this, person- or post-
  // typed topics would route to a specialized container and the button
  // would never render.
  const claimEligibility = await fetchTopicClaimEligibility(params.entityId).catch(() => ({
    isTopic: false,
    isClaimed: false,
    canClaim: false,
  }));

  if (!claimEligibility.canClaim && result?.entity?.types.map(t => t.id).includes(SystemIds.PERSON_TYPE)) {
    return <ProfileEntityServerContainer params={params} searchParams={searchParams} />;
  }

  if (!claimEligibility.canClaim && entityHasOnlyPostType(result?.entity)) {
    return <PostEntityPage params={params} searchParams={searchParams} />;
  }

  // Pass the already-computed canClaim through to avoid a duplicate eligibility
  // fetch inside DefaultEntityPage.
  return (
    <DefaultEntityPage params={params} searchParams={searchParams} canClaimTopic={claimEligibility.canClaim} />
  );
}
