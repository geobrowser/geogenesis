import { SYSTEM_IDS } from '@geogenesis/ids';

import { cachedFetchEntityType } from './cached-entity-type';
import DefaultEntityPage from './default-entity-page';
import { ProfileEntityServerContainer } from './profile-entity-server-container';

interface Props {
  params: { id: string; entityId: string };
  searchParams: {
    typeId?: string;
    filters?: string;
  };
}

export default async function EntityTemplateStrategy({ params, searchParams }: Props) {
  const decodedId = decodeURI(params.entityId);

  const types = await cachedFetchEntityType(decodedId);

  if (types.includes(SYSTEM_IDS.PERSON_TYPE)) {
    return <ProfileEntityServerContainer params={params} />;
  }

  return <DefaultEntityPage params={params} searchParams={searchParams} />;
}
