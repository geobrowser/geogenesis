import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';

import { fetchEntityType } from '~/core/io/fetch-entity-type';
import { Params } from '~/core/params';
import { ServerSideEnvParams } from '~/core/types';

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

  console.log(types);

  if (types.includes(SYSTEM_IDS.PERSON_TYPE)) return <div>Hello Person</div>;

  return <div>Hello world</div>;
}
