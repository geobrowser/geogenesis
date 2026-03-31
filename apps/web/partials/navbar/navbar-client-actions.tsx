'use client';

import * as React from 'react';

import dynamic from 'next/dynamic';

import { useOnboardGuard } from '~/core/hooks/use-onboard-guard';

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
  const { shouldShowElement } = useOnboardGuard();

  return (
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
