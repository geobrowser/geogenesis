import { SYSTEM_IDS } from '@geogenesis/sdk';

import { cloneEntity } from './clone-entity';

export const generateOpsForPerson = async (spaceConfigEntityId: string, spaceName: string) => {
  const [spaceConfigurationActions, postsPageActions] = await Promise.all([
    cloneEntity({
      oldEntityId: SYSTEM_IDS.PERSON_SPACE_CONFIGURATION_TEMPLATE,
      entityId: spaceConfigEntityId,
      entityName: spaceName,
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.PERSON_POSTS_PAGE_TEMPLATE,
      entityName: 'Posts',
    }),
  ]);

  return [...spaceConfigurationActions, ...postsPageActions];
};
