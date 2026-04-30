'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import { useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { NavUtils } from '~/core/utils/utils';

import { Cog } from '~/design-system/icons/cog';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Relation } from '~/design-system/icons/relation';
import { MenuItem } from '~/design-system/menu';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

const CONTEXT_MENU_SURFACE =
  'z-1001 block max-h-[min(400px,75vh)] min-w-0 w-52 overscroll-contain overflow-y-auto scroll-smooth rounded-lg border border-grey-02 bg-white shadow-lg';

export function TableBlockContextMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const { spaceId, entityId, relationId } = useDataBlockInstance();

  const { align, side } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: isMenuOpen,
    preferredHeight: 240,
    gap: 8,
  });

  const onCopyBlockId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsMenuOpen(false);
    } catch {
      console.error('Failed to copy table block entity ID for: ', entityId);
    }
  };

  const onOpenChange = (open: boolean) => {
    setIsMenuOpen(open);
  };

  const onContentWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    trapWheelToElement(e.currentTarget, e);
  }, []);

  return (
    <Dropdown.Root open={isMenuOpen} onOpenChange={onOpenChange}>
      <Dropdown.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border-none bg-transparent text-grey-04 transition hover:bg-bg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-04"
          aria-label="More options"
          aria-expanded={isMenuOpen}
        >
          <Context color="grey-04" />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          side={side}
          align={align}
          sideOffset={8}
          avoidCollisions={true}
          collisionPadding={8}
          className={CONTEXT_MENU_SURFACE}
          onWheel={onContentWheel}
        >
          <MenuItem href={NavUtils.toEntity(spaceId, entityId)}>
            <div className="flex w-full items-center justify-between gap-2">
              <span>View config</span>
              <Cog />
            </div>
          </MenuItem>
          <MenuItem href={NavUtils.toEntity(spaceId, relationId)}>
            <div className="flex w-full items-center justify-between gap-2">
              <span>View block relation</span>
              <Relation />
            </div>
          </MenuItem>
          <MenuItem onClick={onCopyBlockId}>
            <div className="flex w-full items-center justify-between gap-2">
              <span>Copy block ID</span>
              <Copy />
            </div>
          </MenuItem>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
