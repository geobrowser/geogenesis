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
      className="sticky top-0 z-60 flex h-11 w-full items-center justify-between gap-1 border-b border-divider bg-white px-4 py-1 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text max-[359px]:gap-0 max-[359px]:px-2"
    >
      {/* `min-w-0` so this side is what gives when the bar is tight. Without it a flex child will
          not shrink below its content, so on a narrow phone the two groups fought and the controls
          on the right -- the only route to an account since they came back on mobile -- were the
          ones pushed out. The breadcrumb truncating is the right thing to lose. */}
      <div className="flex min-w-0 items-center gap-8 max-[359px]:gap-2! mobile:gap-2 md:gap-4">
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
        {/* The mark holds its size (`shrink-0`) so the squeeze lands on the breadcrumb text. */}
        {hideLogo ? null : (
          <Link href={NavUtils.toRoot()} className={showBrowseButton ? 'shrink-0 mobile:hidden' : 'shrink-0'}>
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
      {/* `shrink-0`: these are fixed-size controls with touch targets to keep. At the 320px floor,
          compact padding and gaps here and in the nested action rows make the fixed controls fit;
          the breadcrumb remains the only content allowed to shrink. */}
      <ClientOnly>
        <div className="shrink-0">
          <NavbarClientActions onSearchClick={onSearchClick} />
        </div>
      </ClientOnly>
    </nav>
  );
}
