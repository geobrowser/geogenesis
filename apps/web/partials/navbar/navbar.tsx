'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import Link from 'next/link';
import { useSelectedLayoutSegments } from 'next/navigation';

import { useSpaces } from '~/core/hooks/use-spaces';

import { ClientOnly } from '~/design-system/client-only';
import { Icon } from '~/design-system/icon';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { GeoLogoLarge } from '~/design-system/icons/geo-logo-large';
import { Spacer } from '~/design-system/spacer';

import { NavbarActions } from './navbar-actions';
import { NavbarBreadcrumb } from './navbar-breadcrumb';
import { NavbarLinkMenu } from './navbar-link-menu';
import { MOCK_PROFILE } from '~/app/space/[id]/[entityId]/template/mock';

interface Props {
  onSearchClick: () => void;
}

export function Navbar({ onSearchClick }: Props) {
  const { spaces } = useSpaces();
  const urlComponents = useSelectedLayoutSegments();

  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceImages = Object.fromEntries(spaces.map(space => [space.id, space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE]]));

  const isHomePage = urlComponents.length === 1 && urlComponents[0] === 'spaces';
  const isProfilePage = urlComponents.length === 2 && urlComponents[0] === 'profile';

  // We always want to return the Space as the active breadcrumb on the /[entityId]
  // and /[id] pages.
  const getActiveImage = () => {
    if (isProfilePage) return MOCK_PROFILE.avatarUrl;
    return spaceImages[urlComponents[1]] ?? '';
  };
  const getActiveName = () => {
    if (isProfilePage) return MOCK_PROFILE.name;
    return spaceNames[urlComponents[1]] ?? '';
  };
  const getActiveLink = () => `/space/${urlComponents[1] ?? ''}`;

  return (
    <nav className="flex h-11 w-full items-center justify-between gap-1 border-b border-divider py-1 px-4">
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

      {/* Hide navbar actions until we are on the client. This is because our account state only exists
          on the client due to the nature of wallets. By having different client and server states
          on first render we trigger hydration errors.

          One possible solution is to track login state as a cookie, but for now we don't track any
          login state on the server.

          We encapsulate the search in the ClientOnly even though its not dependent on account state so
          we don't get any layout shift when the navbar actions appear.
      */}
      <ClientOnly>
        <div className="flex items-center">
          <button className="flex items-center gap-2 text-grey-04 hover:text-text" onClick={onSearchClick}>
            <Icon icon="search" />
            <p className="text-input">Search</p>
          </button>
          <div className="flex items-center sm:hidden">
            <Spacer width={16} />
            <NavbarActions spaceId={urlComponents?.[1]} />
          </div>
        </div>
      </ClientOnly>
    </nav>
  );
}
