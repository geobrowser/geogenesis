import * as React from 'react';

import { NavUtils } from '~/core/utils/utils';

import { ClientOnly } from '~/design-system/client-only';
import { GeoLogoLarge } from '~/design-system/icons/geo-logo-large';
import { NavigationMenu } from '~/design-system/icons/navigation-menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { NavbarClientActions } from './navbar-client-actions';
import { NavbarSpaceMetadata } from './navbar-space-metadata';

interface Props {
  browseOpen?: boolean;
  browseButtonRef?: React.Ref<HTMLButtonElement>;
  navbarRef?: React.Ref<HTMLElement>;
  onBrowseClick: () => void;
  onSearchClick: () => void;
  hideLogo?: boolean;
  showBrowseButton?: boolean;
}

export function Navbar({
  browseOpen = false,
  browseButtonRef,
  navbarRef,
  onBrowseClick,
  onSearchClick,
  hideLogo = false,
  showBrowseButton = true,
}: Props) {
  return (
    <nav
      ref={navbarRef}
      tabIndex={-1}
      data-app-navbar
      className="sticky top-0 z-60 flex h-11 w-full items-center justify-between gap-1 border-b border-divider bg-white px-4 py-1 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text"
    >
      <div className="flex min-w-0 items-center gap-8 mobile:gap-2 md:gap-4">
        {showBrowseButton ? (
          <button
            ref={browseButtonRef}
            type="button"
            aria-label="Open browse menu"
            aria-haspopup="dialog"
            aria-expanded={browseOpen}
            aria-controls="mobile-browse-drawer"
            onClick={onBrowseClick}
            className="-my-1 -ml-3 hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg text-grey-04 transition-colors hover:bg-grey-01 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text active:bg-divider mobile:flex"
          >
            <NavigationMenu />
          </button>
        ) : null}
        {hideLogo ? null : (
          <Link href={NavUtils.toRoot()} className={showBrowseButton ? 'mobile:hidden' : undefined}>
            <GeoLogoLarge />
          </Link>
        )}
        <NavbarSpaceMetadata />
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
        <NavbarClientActions onSearchClick={onSearchClick} />
      </ClientOnly>
    </nav>
  );
}
