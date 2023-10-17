'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';

import { Services } from '~/core/services';
import { NavUtils } from '~/core/utils/utils';

import { ChevronRight } from '~/design-system/icons/chevron-right';

import { NavbarBreadcrumb } from './navbar-breadcrumb';
import { NavbarLinkMenu } from './navbar-link-menu';

export function NavbarSpaceMetadata() {
  const { subgraph, config } = Services.useServices();
  const params = useParams();
  const spaceId: string | undefined = params?.['id'] as string | undefined;

  const { data: space } = useQuery({
    queryKey: ['space', spaceId, config.subgraph],
    queryFn: async () => {
      if (!spaceId) return null;
      return await subgraph.fetchSpace({ id: spaceId, endpoint: config.subgraph });
    },
    suspense: true,
  });

  if (!space) {
    return null;
  }

  const href = NavUtils.toSpace(space.id);
  const img = space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE];
  const name = space.attributes[SYSTEM_IDS.NAME] ?? space.id;

  return (
    <div>
      <div className="flex items-center gap-2">
        <NavbarLinkMenu />

        <ChevronRight color="grey-03" />

        <NavbarBreadcrumb href={href} img={img ?? null}>
          {name.slice(0, 48) + (name.length > 48 ? '...' : '')}
        </NavbarBreadcrumb>
      </div>
    </div>
  );
}
