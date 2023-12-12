import { SYSTEM_IDS } from '@geogenesis/ids';

import { fetchEntityType } from '~/core/io/fetch-entity-type';

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
  const decodedId = decodeURIComponent(params.entityId);

  const types = await fetchEntityType({
    id: decodedId,
  });

  console.log('types', types);

  if (types.includes(SYSTEM_IDS.PERSON_TYPE)) {
    return <ProfileEntityServerContainer params={params} />;
  }

  return <DefaultEntityPage params={params} searchParams={searchParams} />;
}
