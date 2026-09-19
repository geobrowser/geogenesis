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
    <div className="flex items-center gap-3">
      <CreateEntityDropdown />

      <button
        className="rounded-full p-2 text-grey-04 transition-colors duration-200 hover:bg-grey-01 focus:bg-grey-01 active:bg-divider"
        onClick={onSearchClick}
      >
        <Search />
      </button>

      <DebatesHubButton />

      {/* Shown on every width. This was `sm:hidden`, and `sm` here is max-width 639px
          (`styles.css`, `@custom-variant sm`) rather than Tailwind's usual min-width — so it hid
          the account surface on phones, which is the opposite of what the class reads as. That is
          the whole of signing in when logged out, and the avatar, personal space link and sign out
          when logged in, so a phone had no way to reach an account at all. */}
      <div className="flex items-center">
        <NavbarActions />
      </div>
    </div>
  );
}
