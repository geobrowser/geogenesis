import { SYSTEM_IDS } from '@geogenesis/sdk';

import { cloneEntity } from './clone-entity';

export const generateOpsForNonprofit = async (spaceConfigEntityId: string, spaceName: string) => {
  const [spaceConfigurationOps, postsPageOps, projectsPageOps, financesPageOps] = await Promise.all([
    cloneEntity({
      oldEntityId: SYSTEM_IDS.NONPROFIT_OVERVIEW_PAGE_TEMPLATE,
      entityId: spaceConfigEntityId,
      entityName: spaceName,
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.NONPROFIT_POSTS_PAGE_TEMPLATE,
      entityName: '',
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.NONPROFIT_PROJECTS_PAGE_TEMPLATE,
      entityName: '',
    }),
    cloneEntity({
      oldEntityId: SYSTEM_IDS.NONPROFIT_FINANCES_PAGE_TEMPLATE,
      entityName: '',
    }),
  ]);

  return [...spaceConfigurationOps, ...postsPageOps, ...projectsPageOps, ...financesPageOps];
};
