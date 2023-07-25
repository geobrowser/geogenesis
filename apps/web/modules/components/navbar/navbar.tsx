'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { A } from '@mobily/ts-belt';
import Link from 'next/link';
import { useSelectedLayoutSegments } from 'next/navigation';

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
  const { spaces } = useSpaces();
  const urlComponents = useSelectedLayoutSegments();

  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceImages = Object.fromEntries(spaces.map(space => [space.id, space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]]));

  const isHomePage = urlComponents.length === 1 && urlComponents[0] === 'spaces';

  // We always want to return the Space as the active breadcrumb on the /[entityId]
  // and /[id] pages.
  const getActiveImage = () => spaceImages[urlComponents[1]] ?? '';
  const getActiveName = () => spaceNames[urlComponents[1]] ?? '';
  const getActiveLink = () => `/space/${urlComponents[1] ?? ''}`;

  return (
    <nav className="flex w-full items-center justify-between gap-1 border-b border-divider py-1 px-4 md:py-3 md:px-4">
      <div className="flex items-center gap-8 md:gap-4">
        <Link href="/spaces">
          <GeoLogoLarge />
        </Link>
        {!isHomePage && (
          <div className="flex items-center gap-2">
            <NavbarLinkMenu />

            <ChevronRight color="grey-03" />

            <NavbarBreadcrumb href={getActiveLink()} img={getActiveImage()}>
              {getActiveName().slice(0, 48) + (getActiveName().length > 48 ? '...' : '')}
            </NavbarBreadcrumb>
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
          <NavbarActions spaceId={urlComponents?.[2]?.split('?')[0] ?? ''} />
        </div>
      </div>
    </nav>
  );
}
