'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import { useAtom } from 'jotai';

import type { Source } from '~/core/blocks/data/source';
import { useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { NavUtils } from '~/core/utils/utils';

import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Cog } from '~/design-system/icons/cog';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Relation } from '~/design-system/icons/relation';
import { MenuItem } from '~/design-system/menu';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

import { editingPropertiesAtom } from '~/atoms';

import { TableBlockEditPropertiesPanel } from './table-block-edit-properties-panel';

const listScrollClassName =
  'max-h-[198px] min-h-0 overflow-y-auto overscroll-contain scroll-smooth snap-y snap-mandatory';
const listRowClassName = 'snap-start min-h-[44px] shrink-0';

const CONTEXT_MENU_SURFACE =
  'z-1001 min-w-0 w-52 overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg';

type TableBlockContextMenuProps = {
  sourceType: Source['type'];
};

export function TableBlockContextMenu({ sourceType }: TableBlockContextMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const { spaceId, entityId, relationId } = useDataBlockInstance();
  const isEditing = useUserIsEditing(spaceId);
  const [isEditingProperties, setIsEditingProperties] = useAtom(editingPropertiesAtom);

  const { align, side } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: isMenuOpen,
    preferredHeight: 240,
    gap: 8,
  });

  const onCopyBlockId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsMenuOpen(false);
      setIsEditingProperties(false);
    } catch {
      console.error('Failed to copy table block entity ID for: ', entityId);
    }
  };

  const onOpenChange = (open: boolean) => {
    setIsMenuOpen(open);
    if (!open) {
      setIsEditingProperties(false);
    }
  };

  const onListWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
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
        >
          <div className={listScrollClassName} onWheel={onListWheel}>
            {isEditingProperties && sourceType === 'RELATIONS' ? (
              <TableBlockEditPropertiesPanel />
            ) : (
              <>
                {isEditing && sourceType === 'RELATIONS' && (
                  <MenuItem className={listRowClassName} onClick={() => setIsEditingProperties(true)}>
                    <div className="flex w-full items-center justify-between gap-2">
                      <span>Edit properties</span>
                      <ChevronRight />
                    </div>
                  </MenuItem>
                )}
                <MenuItem className={listRowClassName} href={NavUtils.toEntity(spaceId, entityId)}>
                  <div className="flex w-full items-center justify-between gap-2">
                    <span>View config</span>
                    <Cog />
                  </div>
                </MenuItem>
                <MenuItem className={listRowClassName} href={NavUtils.toEntity(spaceId, relationId)}>
                  <div className="flex w-full items-center justify-between gap-2">
                    <span>View block relation</span>
                    <Relation />
                  </div>
                </MenuItem>
                <MenuItem className={listRowClassName} onClick={onCopyBlockId}>
                  <div className="flex w-full items-center justify-between gap-2">
                    <span>Copy block ID</span>
                    <Copy />
                  </div>
                </MenuItem>
              </>
            )}
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
