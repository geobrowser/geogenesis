'use client';

import * as Dialog from '@radix-ui/react-dialog';

import * as React from 'react';

import { BrowseSidebar } from './browse-sidebar';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileBrowseDrawer({ open, onOpenChange }: Props) {
  const closeAfterNavigation = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('a')) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-100 hidden bg-text/30 sm:block" />
        <Dialog.Content
          onClickCapture={closeAfterNavigation}
          className="fixed inset-y-0 left-0 z-101 hidden w-[min(20rem,calc(100vw-3rem))] bg-white shadow-[4px_0_24px_rgba(32,32,32,0.12)] focus:outline-hidden sm:flex"
        >
          <Dialog.Title className="sr-only">Browse Geo</Dialog.Title>
          <Dialog.Description className="sr-only">Navigate Geo destinations, apps, and spaces.</Dialog.Description>
          <BrowseSidebar presentation="mobile" onClose={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
