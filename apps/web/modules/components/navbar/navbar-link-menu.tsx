import * as React from 'react';

import { useRouter } from 'next/router';
import { SYSTEM_IDS } from '~/../../packages/ids';
import { ZERO_WIDTH_SPACE } from '~/modules/constants';
import { Context } from '~/modules/design-system/icons/context';
import { Menu } from '~/modules/design-system/menu';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { Dictionary } from '~/modules/types';
import { titleCase } from '~/modules/utils';
import { NavbarLinkMenuItem } from './navbar-link-menu-item';
import { Close } from '~/modules/design-system/icons/close';

export function NavbarLinkMenu() {
  const [open, onOpenChange] = React.useState(false);
  const router = useRouter();
  const { spaces } = useSpaces();

  const components = router.asPath.split('/');
  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceImages = Object.fromEntries(spaces.map(space => [space.id, space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]]));

  const onClick = (path: string) => {
    onOpenChange(false);
    router.push(path);
  };

  return (
    <Menu
      open={open}
      onOpenChange={onOpenChange}
      align="start"
      trigger={open ? <Close color="grey-04" /> : <Context color="grey-04" />}
    >
      {components.map((component, index) => {
        if (index === 0 || index === 3) return null; // skip the "Geo" part
        const { path, title, img } = getComponentRoute({
          components,
          index,
          spaceNames,
          spaceImages,
          pageName: '',
        });

        return (
          <NavbarLinkMenuItem key={index + path} onClick={() => onClick(path)} img={img}>
            {title.slice(0, 36) + (title.length > 36 ? '...' : '')}
          </NavbarLinkMenuItem>
        );
      })}
    </Menu>
  );
}

type GetComponentRouteConfig = {
  components: string[];
  index: number;
  spaceNames: Dictionary<string, string>;
  spaceImages: Dictionary<string, string>;
  pageName: string;
};

type ComponentRoute = {
  title: string;
  path: string;
  img: string | null;
};

function getComponentRoute({
  components,
  index,
  spaceNames,
  spaceImages,
  pageName,
}: GetComponentRouteConfig): ComponentRoute {
  const component = components[index];
  const path = components.slice(0, index + 1).join('/');

  // Remove any query params
  const componentName = component.split('?')?.[0];

  switch (components[1]) {
    case 'space':
      switch (index) {
        case 1:
          return { path: '/spaces', title: 'Spaces', img: '/spaces.png' };
        case 2:
          return { path, title: spaceNames[componentName] ?? ZERO_WIDTH_SPACE, img: spaceImages[componentName] ?? '' };
        case 3:
          return { path, title: pageName || titleCase(componentName), img: '/facts.svg' };
      }
  }

  return { path, title: titleCase(component), img: '/spaces.png' };
}
