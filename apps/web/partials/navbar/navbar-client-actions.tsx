'use client';

import * as React from 'react';

import dynamic from 'next/dynamic';

import { Search } from '~/design-system/icons/search';

const CreateEntityDropdown = dynamic(
  () => import('../create-entity/create-entity-dropdown').then(m => ({ default: m.CreateEntityDropdown })),
  { ssr: false }
);

const NavbarActions = dynamic(() => import('./navbar-actions').then(m => ({ default: m.NavbarActions })), {
  ssr: false,
});

const DebatesHubButton = dynamic(
  () => import('~/core/debates/matchmaking/debates-hub-button').then(m => ({ default: m.DebatesHubButton })),
  { ssr: false }
);

interface Props {
  onSearchClick: () => void;
}

export function NavbarClientActions({ onSearchClick }: Props) {
  return (
    <div className="flex items-center gap-3 max-[359px]:gap-1">
      <CreateEntityDropdown />

      <button
        aria-label="Search"
        className="rounded-full p-2 text-grey-04 transition-colors duration-200 hover:bg-grey-01 focus:bg-grey-01 active:bg-divider"
        onClick={onSearchClick}
      >
        <Search />
      </button>

      <DebatesHubButton />

      {/* No wrapper and no width condition. This sat behind the phone breakpoint (`sm:hidden`,
          now named `mobile:hidden`), which is max-width 639px rather than Tailwind's usual
          min-width — so it hid the account surface on phones. That is signing in when logged out,
          and the avatar, personal space link and sign out when logged in, so a phone had no way
          to reach an account at all.
          `NavbarActions` brings its own `flex items-center` row, so the div was carrying the
          condition and nothing else. */}
      <NavbarActions />
    </div>
  );
}
