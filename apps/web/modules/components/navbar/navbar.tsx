import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { SYSTEM_IDS } from '@geogenesis/ids';

import { ZERO_WIDTH_SPACE } from '~/modules/constants';
import { LinkableBreadcrumb } from '~/modules/design-system/breadcrumb';
import { IconButton } from '~/modules/design-system/button';
import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { Discord } from '~/modules/design-system/icons/discord';
import { GeoLogoLarge } from '~/modules/design-system/icons/geo-logo-large';
import { Spacer } from '~/modules/design-system/spacer';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { usePageName } from '~/modules/stores/use-page-name';
import { Dictionary } from '~/modules/types';
import { intersperse, titleCase } from '~/modules/utils';
import { ExternalLink } from '../external-link';
import { NavbarActions } from './navbar-actions';

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

  return (
    <div className="flex w-full items-center justify-between gap-1 bg-white py-1 px-4 shadow-big md:py-3 md:px-4">
      <div className="flex max-w-[40%] items-center gap-8 overflow-hidden md:max-w-full md:gap-4 [&>a:last-child]:max-w-[99%] [&>a:last-child]:overflow-hidden md:[&>a:nth-of-type(3)]:hidden md:[&>span:nth-of-type(2)]:hidden">
        <Link href="/" passHref>
          <a>
            <GeoLogoLarge />
          </a>
        </Link>
        <div className="flex items-center gap-2 overflow-hidden">
          {intersperse(
            components.map((component, index) => {
              if (index === 0) return null; // skip the "Geo" part
              const { path, title, img } = getComponentRoute({ components, index, spaceNames, spaceImages, pageName });

              return (
                <LinkableBreadcrumb
                  isNested={index < components.length - 1}
                  shouldTruncate={index === 3}
                  key={index}
                  href={path}
                  img={img}
                >
                  {title}
                </LinkableBreadcrumb>
              );
            }),
            ({ index }) => {
              if (index === 1) return null; // skip the "Geo" part
              return (
                <span key={`separator-${index}`} style={{ rotate: '270deg' }}>
                  <ChevronDownSmall color="grey-03" />
                </span>
              );
            }
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
    </div>
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
