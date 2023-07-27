'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { useRouter, useSelectedLayoutSegments } from 'next/navigation';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';

import { useSpaces } from '~/core/hooks/use-spaces';
import { Dictionary } from '~/core/types';

import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Menu } from '~/design-system/menu';

import { NavbarLinkMenuItem } from './navbar-link-menu-item';

export function NavbarLinkMenu() {
  const [open, onOpenChange] = React.useState(false);
  const router = useRouter();
  const { spaces } = useSpaces();
  const urlComponents = useSelectedLayoutSegments();

  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceImages = Object.fromEntries(spaces.map(space => [space.id, space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]]));

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
        {urlComponents.map((component, index) => {
          if (index >= 2) return null; // skip the "/space/" part
          const { path, title, img } = getComponentRoute({
            urlComponents,
            index,
            spaceNames,
            spaceImages,
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
  spaceNames: Dictionary<string, string>;
  spaceImages: Dictionary<string, string>;
};

type ComponentRoute = {
  title: string;
  path: string;
  img: string | null;
};

function getComponentRoute({ urlComponents, index, spaceNames, spaceImages }: GetComponentRouteConfig): ComponentRoute {
  const component = urlComponents[index];

  switch (index) {
    case 0:
      return { path: '/spaces', title: 'Spaces', img: '/spaces.png' };
    case 1:
      return { path: `/space/${component}`, title: spaceNames[component] ?? '', img: spaceImages[component] ?? '' };
    default:
      throw new Error(
        `Generated a breadcrumb component for a nested route structure that is not supported: ${urlComponents}, ${component}`
      );
  }
}
