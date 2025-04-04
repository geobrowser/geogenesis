'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';
import { useCallback } from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { DataBlockView, useView } from '~/core/blocks/data/use-view';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { BulletedListView } from '~/design-system/icons/bulleted-list-view';

import { Check } from '~/design-system/icons/check';
import { Close } from '~/design-system/icons/close';
import { GalleryView } from '~/design-system/icons/gallery-view';
import { ListView } from '~/design-system/icons/list-view';
import { TableView } from '~/design-system/icons/table-view';
import { MenuItem } from '~/design-system/menu';
import { ColorName } from '~/design-system/theme/colors';

type TableBlockViewMenuProps = {
  activeView: DataBlockView;
  isLoading: boolean;
};

export function DataBlockViewMenu({ activeView, isLoading }: TableBlockViewMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { spaceId } = useDataBlock();

  const isEditing = useUserIsEditing(spaceId);

  const onOpenChange = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  if (!isEditing) return null;

  return (
    <Dropdown.Root open={isMenuOpen} onOpenChange={onOpenChange}>
      <Dropdown.Trigger>
        {isMenuOpen ? <Close color="grey-04" /> : <ViewIcon view={activeView} color="grey-04" />}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={8}
          className="z-100 block !w-[160px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
          align="end"
        >
          {DATA_BLOCK_VIEWS.map(view => {
            return <ToggleView key={view.value} activeView={activeView} view={view} isLoading={isLoading} />;
          })}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function ViewIcon({ view, color }: { view: DataBlockView; color: ColorName }) {
  switch (view) {
    case 'TABLE':
      return <TableView color={color} />;
    case 'LIST':
      return <ListView color={color} />;
    case 'GALLERY':
      return <GalleryView color={color} />;
    case 'BULLETED_LIST':
      return <BulletedListView color={color} />;
  }
}

type DataBlockViewDetails = { name: string; id: string; value: DataBlockView };

const DATA_BLOCK_VIEWS: Array<DataBlockViewDetails> = [
  { name: 'Table', id: SystemIds.TABLE_VIEW, value: 'TABLE' },
  { name: 'Gallery', id: SystemIds.GALLERY_VIEW, value: 'GALLERY' },
  { name: 'List', id: SystemIds.LIST_VIEW, value: 'LIST' },
  { name: 'Bulleted List', id: SystemIds.BULLETED_LIST_VIEW, value: 'BULLETED_LIST' },
];

type ToggleViewProps = {
  activeView: DataBlockView;
  view: DataBlockViewDetails;
  isLoading: boolean;
};

const ToggleView = ({ activeView, view, isLoading }: ToggleViewProps) => {
  const isActive = !isLoading && activeView === view.value;
  const { setView } = useView();

  const onToggleView = useCallback(async () => {
    setView(view);
  }, [setView, view]);

  return (
    <MenuItem active={isActive}>
      <button onClick={onToggleView} className="flex w-full items-center justify-between gap-2" disabled={isActive}>
        <div className="inline-flex items-center gap-2">
          <ViewIcon view={view.value} color="text" />
          <span className="whitespace-nowrap">{view.name}</span>
        </div>
        {isActive ? <Check /> : null}
      </button>
    </MenuItem>
  );
};
