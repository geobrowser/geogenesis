'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { NavUtils } from '~/core/utils/utils';

import { Close } from '~/design-system/icons/close';
import { Cog } from '~/design-system/icons/cog';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Fullscreen } from '~/design-system/icons/fullscreen';
import { Relation } from '~/design-system/icons/relation';
import { MenuItem } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

export function TableBlockFullscreenButton() {
  const { spaceId, entityId, relationId } = useDataBlock();

  return (
    <Link
      href={`/space/${spaceId}/${entityId}/power-tools?relationId=${relationId}`}
      aria-label="Open fullscreen"
      className="inline-flex h-5 w-5 items-center justify-center text-grey-04 transition-colors hover:text-text"
    >
      <Fullscreen />
    </Link>
  );
}

export function TableBlockContextMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { spaceId, entityId, relationId } = useDataBlock();

  const onCopyBlockId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsMenuOpen(false);
    } catch {
      console.error('Failed to copy table block entity ID for: ', entityId);
    }
  };

  const onOpenChange = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <Dropdown.Root open={isMenuOpen} onOpenChange={onOpenChange}>
      <Dropdown.Trigger>{isMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={8}
          className="z-1001 block max-h-[356px] w-[200px]! overflow-y-auto rounded-lg border border-grey-02 bg-white shadow-lg"
          align="start"
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
