import { SYSTEM_IDS } from '@geobrowser/gdk';

import { cloneEntity } from './clone-entity';

export const generateTriplesForNonprofit = async (
  spaceConfigEntityId: string,
  spaceName: string,
  spaceAddress: string
) => {
  const [spaceConfigurationActions, postsPageActions, projectsPageActions, financesPageActions] = await Promise.all([
    cloneEntity({
      oldEntityId: SYSTEM_IDS.NONPROFIT_SPACE_CONFIGURATION_TEMPLATE,
      entityId: spaceConfigEntityId,
      entityName: spaceName,
      spaceId: spaceAddress,
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.NONPROFIT_POSTS_PAGE_TEMPLATE,
      entityName: 'Posts',
      spaceId: spaceAddress,
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.NONPROFIT_PROJECTS_PAGE_TEMPLATE,
      entityName: 'Projects',
      spaceId: spaceAddress,
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.NONPROFIT_FINANCES_PAGE_TEMPLATE,
      entityName: 'Finances',
      spaceId: spaceAddress,
    }),
  ]);

  return [...spaceConfigurationActions, ...postsPageActions, ...projectsPageActions, ...financesPageActions];
};
