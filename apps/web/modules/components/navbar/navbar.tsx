import { SYSTEM_IDS } from '@geogenesis/ids';
import { A } from '@mobily/ts-belt';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { ZERO_WIDTH_SPACE } from '~/modules/constants';
import { IconButton } from '~/modules/design-system/button';
import { ChevronRight } from '~/modules/design-system/icons/chevron-right';
import { Context } from '~/modules/design-system/icons/context';
import { Discord } from '~/modules/design-system/icons/discord';
import { GeoLogoLarge } from '~/modules/design-system/icons/geo-logo-large';
import { Menu } from '~/modules/design-system/menu';
import { Spacer } from '~/modules/design-system/spacer';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { usePageName } from '~/modules/stores/use-page-name';
import { Dictionary } from '~/modules/types';
import { titleCase } from '~/modules/utils';
import { ExternalLink } from '../external-link';
import { NavbarActions } from './navbar-actions';
import { NavbarBreadcrumb } from './navbar-breadcrumb';
import { NavbarLinkMenuItem } from './navbar-link-menu-item';

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

interface Props {
  onSearchClick: () => void;
}

export function Navbar({ onSearchClick }: Props) {
  const router = useRouter();
  const asPath = router.asPath;
  const components = asPath.split('/');
  const { spaces } = useSpaces();
  const { pageName } = usePageName();

  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceImages = Object.fromEntries(spaces.map(space => [space.id, space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]]));

  // @TODO:
  // Only show the most current breadcrumb
  // Menu component to show all other breadcrumbs
  // - [ ] Detect which _level_ we are in
  // - [ ] Breadcrumb item component for Menu
  // - [ ] Menu component – We want to switch the icon depending on if the menu is open or not
  // - [ ] Close menu on click
  console.log('last component', A.last(components));
  console.log('all component', components);

  const activeBreadcrumb = A.last(components);
  const activeBreadcrumbName = activeBreadcrumb?.split('?')[0];

  const isHomePage = components.length === 1 && components[0] === '';
  const isSpacePage = components.length === 2 && components[1] === 'space';
  const isEntityPage = components.length === 3 && components[1] === 'space';
  // 404?

  return (
    <nav className="flex w-full items-center justify-between gap-1 border-b border-divider py-1 px-4 md:py-3 md:px-4">
      <div className="flex max-w-[40%] items-center gap-8 overflow-hidden md:max-w-full md:gap-4 [&>a:last-child]:max-w-[99%] [&>a:last-child]:overflow-hidden md:[&>a:nth-of-type(3)]:hidden md:[&>span:nth-of-type(2)]:hidden">
        <Link href="/" passHref>
          <a>
            <GeoLogoLarge />
          </a>
        </Link>
        <div className="flex items-center gap-2 overflow-hidden">
          <Menu align="start" trigger={<Context color="grey-04" />}>
            {components.map((component, index) => {
              if (index === 0) return null; // skip the "Geo" part
              const { path, title, img } = getComponentRoute({ components, index, spaceNames, spaceImages, pageName });

              return (
                // @TODO: Close menu on click
                <NavbarLinkMenuItem key={index + path} onClick={() => router.push(path)} img={img}>
                  {title}
                </NavbarLinkMenuItem>
              );
            })}
          </Menu>

          <ChevronRight color="grey-03" />

          {activeBreadcrumb && (
            <NavbarBreadcrumb href={activeBreadcrumb} img={spaceImages[activeBreadcrumbName ?? ''] ?? '/facts.svg'}>
              {spaceNames[activeBreadcrumbName ?? ''] ?? pageName ?? ''}
            </NavbarBreadcrumb>
          )}
        </div>
      </div>
      <div className="flex items-center">
        <IconButton onClick={onSearchClick} icon="search" />
        <Spacer width={16} />
        <DiscordLink />
        <Spacer width={16} />
        <NavbarActions spaceId={components?.[2]?.split('?')[0] ?? ''} />
      </div>
    </nav>
  );
}

function DiscordLink() {
  return (
    <ExternalLink href="https://discord.gg/axFtvyxRNQ">
      <div className="flex w-[105px] items-center text-button text-grey-04 transition-all duration-150 ease-in-out hover:text-text">
        <Discord />
        <Spacer width={8} />
        <p>Geo Discord</p>
      </div>
    </ExternalLink>
  );
}
