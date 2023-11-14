import { SYSTEM_IDS } from '@geogenesis/ids';

import { Environment } from '~/core/environment';
import { API } from '~/core/io';
import { fetchEntityType } from '~/core/io/fetch-entity-type';

import DefaultEntityPage from './default-entity-page';
import { ProfileEntityServerContainer } from './profile-entity-server-container';

export const runtime = 'edge';

interface Props {
  params: { id: string; entityId: string };
  searchParams: {
    typeId?: string;
    filterId?: string;
    filterValue?: string;
  };
}

export default async function EntityTemplateStrategy({ params, searchParams }: Props) {
  let config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const { isPermissionlessSpace } = await API.space(params.id);

  if (isPermissionlessSpace) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
  }

  const types = await fetchEntityType({
    endpoint: config.subgraph,
    id: params.entityId,
  });

  params.entityId = decodeURIComponent(params.entityId);

  if (types.includes(SYSTEM_IDS.PERSON_TYPE)) {
    // @ts-expect-error async JSX function
    return <ProfileEntityServerContainer params={params} />;
  }

  return <DefaultEntityPage params={params} searchParams={searchParams} />;
}
