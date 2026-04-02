import cx from 'classnames';

import { NavUtils } from '~/core/utils/utils';

import { ClientOnly } from '~/design-system/client-only';
import { GeoLogoLarge } from '~/design-system/icons/geo-logo-large';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { NavbarClientActions } from './navbar-client-actions';
import { NavbarSpaceMetadata } from './navbar-space-metadata';

interface Props {
  onSearchClick: () => void;
}

export function Navbar({ onSearchClick }: Props) {
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
        <NavbarClientActions onSearchClick={onSearchClick} />
      </ClientOnly>
    </nav>
  );
}
