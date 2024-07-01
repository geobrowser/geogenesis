import { SYSTEM_IDS } from '@geogenesis/sdk';

import { cloneEntity } from './clone-entity';

export const generateTriplesForPerson = async (
  spaceConfigEntityId: string,
  spaceName: string,
  spaceAddress: string
) => {
  const [spaceConfigurationActions, postsPageActions] = await Promise.all([
    cloneEntity({
      oldEntityId: SYSTEM_IDS.PERSON_SPACE_CONFIGURATION_TEMPLATE,
      entityId: spaceConfigEntityId,
      entityName: spaceName,
      spaceId: spaceAddress,
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.PERSON_POSTS_PAGE_TEMPLATE,
      entityName: 'Posts',
      spaceId: spaceAddress,
    }),
  ]);

  return [...spaceConfigurationActions, ...postsPageActions];
};
