'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';

import { Services } from '~/core/services';
import { Entity } from '~/core/utils/entity';
import { NavUtils, isPermissionlessSpace } from '~/core/utils/utils';

import { ChevronRight } from '~/design-system/icons/chevron-right';

import { NavbarBreadcrumb } from './navbar-breadcrumb';
import { NavbarLinkMenu } from './navbar-link-menu';

export function NavbarSpaceMetadata() {
  let { config } = Services.useServices();
  const { subgraph } = Services.useServices();
  const params = useParams();
  const spaceId: string | undefined = params?.['id'] as string | undefined;

  const { data } = useQuery({
    queryKey: ['space', spaceId, config.subgraph],
    queryFn: async ({ signal }) => {
      if (!spaceId) return null;
      const space = await subgraph.fetchSpace({ id: spaceId });
      const isPermissionless = isPermissionlessSpace(spaceId);

      if (!space) return null;

      if (isPermissionless) {
        config = {
          ...config,
          subgraph: config.permissionlessSubgraph,
        };
      }

      const spaceConfig = space.spaceConfig;

      if (!spaceConfig) {
        return {
          name: space.attributes[SYSTEM_IDS.NAME] ?? space.id,
          img: space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE],
          href: NavUtils.toSpace(space.id),
        };
      }

      return {
        name: spaceConfig.name ?? space.id,
        img: Entity.avatar(spaceConfig.triples) ?? Entity.cover(spaceConfig.triples),
        href: NavUtils.toSpace(space.id),
      };
    },
    suspense: true,
  });

  if (!data) {
    return null;
  }

  const { href, img, name } = data;

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
