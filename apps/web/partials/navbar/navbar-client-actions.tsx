'use client';

import * as React from 'react';

import dynamic from 'next/dynamic';

import { Search } from '~/design-system/icons/search';

const CreateEntityDropdown = dynamic(
  () => import('../create-entity/create-entity-dropdown').then(m => ({ default: m.CreateEntityDropdown })),
  { ssr: false }
);

const NavbarAccountActions = dynamic(
  () => import('./navbar-account-actions').then(m => ({ default: m.NavbarAccountActions })),
  { ssr: false }
);

interface Props {
  onSearchClick: () => void;
  compact?: boolean;
}

export function NavbarClientActions({ onSearchClick, compact = false }: Props) {
  return (
    <div className="flex items-center gap-3 max-[359px]:gap-1">
      {!compact ? (
        <>
          <div className="mobile:hidden">
            <CreateEntityDropdown />
          </div>
          <button
            aria-label="Search"
            className="rounded-full p-2 text-grey-04 transition-colors duration-200 hover:bg-grey-01 focus:bg-grey-01 active:bg-divider"
            onClick={onSearchClick}
          >
            <Search />
          </button>
        </>
      ) : null}

      {/* Keep this subtree mounted when the route or viewport changes: profile saves can outlive
          the dialog closing. Only its appearance changes for mobile Explore. */}
      <NavbarAccountActions compact={compact} />
    </div>
  );
}
