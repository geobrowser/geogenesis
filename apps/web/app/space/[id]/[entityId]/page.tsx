import { SYSTEM_IDS } from '@geogenesis/ids';

import { Environment } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { fetchEntityType } from '~/core/io/fetch-entity-type';

import DefaultEntityPage from './default-entity-page';
import { ProfileEntityServerContainer } from './profile-entity-server-container';

interface Props {
  params: { id: string; entityId: string };
  searchParams: {
    typeId?: string;
    filterId?: string;
    filterValue?: string;
  };
}

export default async function EntityTemplateStrategy({ params, searchParams }: Props) {
  let config = Environment.getConfig(process.env.APP_ENV);

  let space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: params.id });
  let usePermissionlessSubgraph = false;

  if (!space) {
    space = await Subgraph.fetchSpace({ endpoint: config.permissionlessSubgraph, id: params.id });
    if (space) usePermissionlessSubgraph = true;
  }

  if (usePermissionlessSubgraph) {
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

  // @ts-expect-error async JSX function
  return <DefaultEntityPage params={params} searchParams={searchParams} />;
}
