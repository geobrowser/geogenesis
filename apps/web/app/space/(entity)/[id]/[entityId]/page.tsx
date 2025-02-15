import { SYSTEM_IDS } from '@graphprotocol/grc-20';

import { TypeId } from '~/core/io/schema';

import { cachedFetchEntityType } from './cached-entity-type';
import DefaultEntityPage from './default-entity-page';
import { ProfileEntityServerContainer } from './profile-entity-server-container';

interface Props {
  params: Promise<{ id: string; entityId: string }>;
}

export default async function EntityTemplateStrategy(props: Props) {
  const params = await props.params;
  const types = await cachedFetchEntityType(params.entityId);

  if (types.includes(TypeId(SYSTEM_IDS.PERSON_TYPE))) {
    return <ProfileEntityServerContainer params={params} />;
  }

  return <DefaultEntityPage params={params} />;
}
