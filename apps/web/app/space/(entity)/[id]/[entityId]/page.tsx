import { SystemIds } from '@graphprotocol/grc-20';

import { cachedFetchEntityType } from './cached-entity-type';
import DefaultEntityPage from './default-entity-page';
import { ProfileEntityServerContainer } from './profile-entity-server-container';

interface Props {
  params: Promise<{ id: string; entityId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function EntityTemplateStrategy(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const types = await cachedFetchEntityType(params.entityId);

  if (types.map(t => t.id).includes(SystemIds.PERSON_TYPE)) {
    return <ProfileEntityServerContainer params={params} />;
  }

  return <DefaultEntityPage params={params} searchParams={searchParams} />;
}
