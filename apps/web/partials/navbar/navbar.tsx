import { NavUtils } from '~/core/utils/utils';

import { ClientOnly } from '~/design-system/client-only';
import { GeoLogoLarge } from '~/design-system/icons/geo-logo-large';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { NavbarClientActions } from './navbar-client-actions';
import { NavbarSpaceMetadata } from './navbar-space-metadata';

interface Props {
  onSearchClick: () => void;
  hideLogo?: boolean;
}

export function Navbar({ onSearchClick, hideLogo = false }: Props) {
  return (
    <nav
      data-app-navbar
      className="sticky top-0 z-60 flex h-11 w-full items-center justify-between gap-1 border-b border-divider bg-white px-4 py-1"
    >
      {/* `min-w-0` so this side is what gives when the bar is tight. Without it a flex child will
          not shrink below its content, so on a narrow phone the two groups fought and the controls
          on the right -- the only route to an account since they came back on mobile -- were the
          ones pushed out. The breadcrumb truncating is the right thing to lose. */}
      <div className="flex min-w-0 items-center gap-8 md:gap-4">
        {/* The mark holds its size (`shrink-0`) so the squeeze lands on the breadcrumb text. */}
        {hideLogo ? null : (
          <Link href={NavUtils.toRoot()} className="shrink-0">
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
      {/* `shrink-0`: these are fixed-size controls with touch targets to keep, so they hold their
          width and the breadcrumb above absorbs the squeeze. */}
      <ClientOnly>
        <div className="shrink-0">
          <NavbarClientActions onSearchClick={onSearchClick} />
        </div>
      </ClientOnly>
    </nav>
  );
}
