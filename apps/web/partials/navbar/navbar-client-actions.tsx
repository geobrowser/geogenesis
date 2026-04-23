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

      <div className="flex items-center sm:hidden">
        <NavbarActions />
      </div>
    </div>
  );
}
