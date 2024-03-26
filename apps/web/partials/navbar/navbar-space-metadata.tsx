'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';

import { Services } from '~/core/services';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { ChevronRight } from '~/design-system/icons/chevron-right';

import { NavbarBreadcrumb } from './navbar-breadcrumb';
import { NavbarLinkMenu } from './navbar-link-menu';

export function NavbarSpaceMetadata() {
  const { subgraph } = Services.useServices();
  const params = useParams();
  const spaceId: string | undefined = params?.['id'] as string | undefined;

  const { data } = useSuspenseQuery({
    queryKey: ['space', spaceId],
    queryFn: async ({ signal }) => {
      if (!spaceId) return null;
      const space = await subgraph.fetchSpace({ id: spaceId });
      if (!space) return null;

      const spaceConfig = space.spaceConfig;

      if (!spaceConfig) {
        return {
          name: space.spaceConfig?.name ?? space.id,
          img: space.spaceConfig?.image ?? null,
          href: NavUtils.toSpace(space.id),
        };
      }

      return {
        name: spaceConfig.name ?? space.id,
        img: Entity.avatar(spaceConfig.triples) ?? Entity.cover(spaceConfig.triples),
        href: NavUtils.toSpace(space.id),
      };
    },
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
