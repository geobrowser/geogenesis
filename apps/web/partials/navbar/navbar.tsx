import cx from 'classnames';

import { useOnboardGuard } from '~/core/hooks/use-onboard-guard';
import { NavUtils } from '~/core/utils/utils';

import { ClientOnly } from '~/design-system/client-only';
import { GeoLogoLarge } from '~/design-system/icons/geo-logo-large';
import { Search } from '~/design-system/icons/search';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { CreateSpaceDropdown } from '../create-space/create-space-dropdown';
import { NavbarActions } from './navbar-actions';
import { NavbarSpaceMetadata } from './navbar-space-metadata';

interface Props {
  onSearchClick: () => void;
}

export function Navbar({ onSearchClick }: Props) {
  const { shouldShowElement } = useOnboardGuard();

  return (
    <nav
      className={cx(
        'flex h-11 w-full items-center justify-between gap-1 border-b border-divider px-4 py-1',
        process.env.NODE_ENV === 'development' && 'sticky top-0 z-100 bg-white'
      )}
    >
      <div className="flex items-center gap-8 md:gap-4">
        <Link href={NavUtils.toRoot()}>
          <GeoLogoLarge />
        </Link>
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
        <div className="flex items-center gap-3">
          {!shouldShowElement && (
            <a
              className="text-button font-normal text-ctaPrimary transition-colors duration-200 hover:text-ctaHover"
              href="https://elfin-share-6f1.notion.site/175273e214eb80258d30ee6755415ce2?pvs=105"
              rel="noreferrer noopener"
              target="_blank"
            >
              Early access
            </a>
          )}

          <CreateSpaceDropdown />

          <button
            className="rounded-full p-2 text-grey-04 transition-colors duration-200 hover:bg-grey-01 focus:bg-grey-01 active:bg-divider"
            onClick={onSearchClick}
          >
            <Search />
          </button>

          <div className="flex items-center sm:hidden">
            <NavbarActions />
          </div>
        </div>
      </ClientOnly>
    </nav>
  );
}
