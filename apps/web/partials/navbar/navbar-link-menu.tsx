'use client';

import { useRouter, useSelectedLayoutSegments } from 'next/navigation';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';

import { useSpace } from '~/core/hooks/use-space';

import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Menu } from '~/design-system/menu';

import { NavbarLinkMenuItem } from './navbar-link-menu-item';

export function NavbarLinkMenu() {
  const [open, onOpenChange] = React.useState(false);
  const router = useRouter();
  const urlComponents = useSelectedLayoutSegments()?.filter(s => !s.startsWith('('));
  const routeSpaceId = urlComponents?.[1];
  const { space: routeSpace } = useSpace(routeSpaceId);

  const onClick = (path: string) => {
    onOpenChange(false);
    router.push(path);
  };

  return (
    <ErrorBoundary fallback={null} onError={e => console.error(e.message)}>
      <Menu
        open={open}
        onOpenChange={onOpenChange}
        align="start"
        trigger={open ? <Close color="grey-04" /> : <Context color="grey-04" />}
      >
        {urlComponents?.map((component, index) => {
          if (index >= 2) return null; // skip the "/space/" part
          const { path, title, img } = getComponentRoute({
            urlComponents,
            index,
            routeSpaceName: routeSpace?.entity?.name ?? null,
            routeSpaceImage: routeSpace?.entity?.image ?? null,
          });

          return (
            <NavbarLinkMenuItem key={index + path} onClick={() => onClick(path)} img={img}>
              {title.slice(0, 36) + (title.length > 36 ? '...' : '')}
            </NavbarLinkMenuItem>
          );
        })}
      </Menu>
    </ErrorBoundary>
  );
}

type GetComponentRouteConfig = {
  urlComponents: string[];
  index: number;
  routeSpaceName: string | null;
  routeSpaceImage: string | null;
};

type ComponentRoute = {
  title: string;
  path: string;
  img: string | null;
};

function getComponentRoute({ urlComponents, index, routeSpaceName, routeSpaceImage }: GetComponentRouteConfig): ComponentRoute {
  const component = urlComponents[index];

  switch (index) {
    case 0:
      return { path: '/root', title: 'Root', img: '/spaces.png' };
    case 1:
      return { path: `/space/${component}`, title: routeSpaceName ?? '', img: routeSpaceImage ?? '' };
    default:
      throw new Error(
        `Generated a breadcrumb component for a nested route structure that is not supported: ${urlComponents}, ${component}`
      );
  }
}
