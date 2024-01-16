import Link from 'next/link';

import { Suspense } from 'react';

import { ClientOnly } from '~/design-system/client-only';
import { GeoLogoLarge } from '~/design-system/icons/geo-logo-large';
import { Search } from '~/design-system/icons/search';
import { Skeleton } from '~/design-system/skeleton';

import { CreateSpaceDropdown } from '../create-space/create-space-dropdown';
import { NavbarActions } from './navbar-actions';
import { NavbarSpaceMetadata } from './navbar-space-metadata';

interface Props {
  onSearchClick: () => void;
}

export function Navbar({ onSearchClick }: Props) {
  return (
    <nav className="flex h-11 w-full items-center justify-between gap-1 border-b border-divider px-4 py-1">
      <div className="flex items-center gap-8 md:gap-4">
        <Link href="/spaces">
          <GeoLogoLarge />
        </Link>
        <Suspense fallback={<SpaceSkeleton />}>
          <NavbarSpaceMetadata />
        </Suspense>
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

function SpaceSkeleton() {
  return <Skeleton className="h-6 w-40" />;
}
