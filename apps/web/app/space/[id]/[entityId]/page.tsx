import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';

import { fetchEntityType } from '~/core/io/fetch-entity-type';
import { Params } from '~/core/params';
import { ServerSideEnvParams } from '~/core/types';

import DefaultEntityPage from './default-entity-page';
import { ProfileEntityServerContainer } from './profile-entity-server-container';

interface Props {
  params: { id: string; entityId: string };
  searchParams: ServerSideEnvParams;
}

export default async function EntityTemplateStrategy({ params, searchParams }: Props) {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const types = await fetchEntityType({
    endpoint: config.subgraph,
    id: params.entityId,
  });

  console.log('types', types);

  if (types.includes(SYSTEM_IDS.PERSON_TYPE)) {
    // @ts-expect-error async JSX function
    return <ProfileEntityServerContainer params={params} searchParams={searchParams} />;
  }

  // @ts-expect-error async JSX function
  return <DefaultEntityPage params={params} searchParams={searchParams} />;
}
