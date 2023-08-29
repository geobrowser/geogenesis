'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import Image from 'next/legacy/image';

import * as React from 'react';

import { useSpaces } from '~/core/hooks/use-spaces';
import { useTableBlock } from '~/core/state/table-block-store';
import { getImagePath } from '~/core/utils/utils';

import { Button } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Input } from '~/design-system/input';
import { Menu } from '~/design-system/menu';

import { TableBlockSchemaConfigurationDialog } from './table-block-schema-configuration-dialog';

export function TableBlockContextMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { type, spaceId } = useTableBlock();

  const { spaces } = useSpaces();
  const space = spaces.find(s => s.id === spaceId);

  return (
    <Menu
      // using modal will prevent the menu from closing when opening up another dialog or popover
      // from within the menu
      modal
      open={isMenuOpen}
      onOpenChange={setIsMenuOpen}
      align="end"
      trigger={isMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
      className="max-w-[180px] divide-x divide-grey-02 whitespace-nowrap bg-white"
    >
      <TableBlockSchemaConfigurationDialog
        content={
          <div className="flex flex-col gap-6 p-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="relative h-4 w-4 overflow-hidden rounded-sm">
                  <Image
                    layout="fill"
                    objectFit="cover"
                    src={getImagePath(space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? '')}
                  />
                </div>
                <h1 className="text-mediumTitle">{type.entityName}</h1>
              </div>

              <h2 className="text-metadata text-grey-04">
                Making changes to this type it will affect everywhere that this type is referenced.
              </h2>
            </div>

            <AddAttribute />
          </div>
        }
      />
    </Menu>
  );
}

function AddAttribute() {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-bodySemibold">Add attribute</h3>
      <div className="flex items-center gap-2">
        <Input />
        <Button icon="plus">Add</Button>
      </div>
    </div>
  );
}
