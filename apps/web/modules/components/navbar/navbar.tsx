import { SYSTEM_IDS } from '@geogenesis/ids';
import { A } from '@mobily/ts-belt';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { ChevronRight } from '~/modules/design-system/icons/chevron-right';
import { GeoLogoLarge } from '~/modules/design-system/icons/geo-logo-large';
import { Icon } from '~/modules/design-system/icon';
import { Spacer } from '~/modules/design-system/spacer';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { NavbarActions } from './navbar-actions';
import { NavbarBreadcrumb } from './navbar-breadcrumb';
import { NavbarLinkMenu } from './navbar-link-menu';

interface Props {
  onSearchClick: () => void;
}

export function Navbar({ onSearchClick }: Props) {
  const router = useRouter();
  const asPath = router.asPath;
  const components = asPath.split('/');
  const { spaces } = useSpaces();

  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceImages = Object.fromEntries(spaces.map(space => [space.id, space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]]));

  // @TODO: This is all super hacky, there should be a better way of doing this.
  // If we migrate to Next 13 with nested routes we should be able to clean up
  // a lot of this since we will know the route structure more explicitly.
  const activeBreadcrumb = A.last(components);
  const activeBreadcrumbName = activeBreadcrumb?.split('?')[0];

  const isHomePage = components.length === 2 && components[1] === 'spaces';
  const isSpacePage = components.length === 3 && components[1] === 'space';
  const isEntityPage = components.length === 4 && components[1] === 'space';

  // We always want to return the Space as the active breadcrumb on the /[entityId]
  // and /[id] pages.
  const getActiveImage = () => {
    if (isHomePage) return '/spaces.png';
    if (isSpacePage) return spaceImages[activeBreadcrumbName ?? ''] ?? '';
    if (isEntityPage) return spaceImages[components[2]] ?? '';
    return '/spaces.png';
  };

  const getActiveName = () => {
    if (isHomePage) return 'Spaces';
    if (isSpacePage) return spaceNames[activeBreadcrumbName ?? ''] ?? '';
    if (isEntityPage) return spaceNames[components[2]] ?? '';
    return '';
  };

  const getActiveLink = () => {
    if (isHomePage) return '/spaces';
    if (isSpacePage) return `/space/${activeBreadcrumbName ?? ''}`;
    if (isEntityPage) return `/space/${components[2]}`;
    return '';
  };

  return (
    <nav className="flex w-full items-center justify-between gap-1 border-b border-divider py-1 px-4 md:py-3 md:px-4">
      <div className="flex items-center gap-8 md:gap-4">
        <Link href="/spaces" passHref>
          <a>
            <GeoLogoLarge />
          </a>
        </Link>
        {!isHomePage && (
          <div className="flex items-center gap-2">
            <NavbarLinkMenu />

            <ChevronRight color="grey-03" />

            {/*
              The activeBreadcrumb really only doesn't exist when on the home page,
              but TypeScript doesn't know that with the current implementation.
            */}
            {activeBreadcrumb && (
              <NavbarBreadcrumb href={getActiveLink()} img={getActiveImage()}>
                {getActiveName().slice(0, 48) + (getActiveName().length > 48 ? '...' : '')}
              </NavbarBreadcrumb>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center">
        <button className="flex items-center gap-2 text-grey-04 hover:text-text" onClick={onSearchClick}>
          <Icon icon="search" />
          <p className="text-input">Search</p>
        </button>
        <div className="flex items-center sm:hidden">
          <Spacer width={16} />
          <NavbarActions spaceId={components?.[2]?.split('?')[0] ?? ''} />
        </div>
      </div>
    </nav>
  );
}
