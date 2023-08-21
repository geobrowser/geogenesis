import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';

import { fetchEntityType } from '~/core/io/fetch-entity-type';
import { Params } from '~/core/params';
import { ServerSideEnvParams } from '~/core/types';

import EntityServerPage from '../page';
import { ProfileServerPage } from './profile-server-page';

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

  // @ts-expect-error async JSX function
  if (types.includes(SYSTEM_IDS.PERSON_TYPE)) return <ProfileServerPage params={params} searchParams={searchParams} />;

  // @ts-expect-error async JSX function
  return <EntityServerPage params={params} searchParams={searchParams} />;
}
