'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';
import { useCallback } from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { DataBlockView, useView } from '~/core/blocks/data/use-view';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { RANKING_VIEW_PILL_ID } from '~/core/ranking-block-ids';

import { BulletedListView } from '~/design-system/icons/bulleted-list-view';
import { Check } from '~/design-system/icons/check';
import { Close } from '~/design-system/icons/close';
import { GalleryView } from '~/design-system/icons/gallery-view';
import { ListView } from '~/design-system/icons/list-view';
import { PillView } from '~/design-system/icons/pill-view';
import { TableView } from '~/design-system/icons/table-view';
import { MenuItem } from '~/design-system/menu';
import { ColorName } from '~/design-system/theme/colors';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

const VIEW_MENU_SURFACE =
  'z-100 block max-h-[220px] min-w-0 w-40 overscroll-contain overflow-y-auto scroll-smooth rounded-lg border border-grey-02 bg-white shadow-lg';

type TableBlockViewMenuProps = {
  activeView: DataBlockView;
  isLoading: boolean;
  /** When true, include ranking-only views such as Pill. */
  includeRankingViews?: boolean;
};

export function DataBlockViewMenu({
  activeView,
  isLoading,
  includeRankingViews = false,
}: TableBlockViewMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [contentElement, setContentElement] = React.useState<HTMLDivElement | null>(null);
  const { align, side } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: isMenuOpen,
    preferredHeight: includeRankingViews ? 220 : 180,
    gap: 8,
    contentElement,
  });
  const { spaceId } = useDataBlock();

  const isEditing = useUserIsEditing(spaceId);

  const views = React.useMemo(() => {
    if (!includeRankingViews) return DATA_BLOCK_VIEWS;
    return [...DATA_BLOCK_VIEWS, ...RANKING_ONLY_VIEWS];
  }, [includeRankingViews]);

  const onOpenChange = (open: boolean) => {
    setIsMenuOpen(open);
  };

  const onContentWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    trapWheelToElement(e.currentTarget, e);
  }, []);

  if (!isEditing) return null;

  return (
    <Dropdown.Root open={isMenuOpen} onOpenChange={onOpenChange}>
      <Dropdown.Trigger ref={triggerRef}>
        {isMenuOpen ? <Close color="grey-04" /> : <ViewIcon view={activeView} color="grey-04" />}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          ref={setContentElement}
          side={side}
          align={align}
          sideOffset={8}
          avoidCollisions={true}
          collisionPadding={8}
          className={VIEW_MENU_SURFACE}
          onWheel={onContentWheel}
        >
          {views.map(view => {
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
    case 'PILL':
      return <PillView color={color} />;
  }
}

type DataBlockViewDetails = { name: string; id: string; value: DataBlockView };

const DATA_BLOCK_VIEWS: Array<DataBlockViewDetails> = [
  { name: 'Table', id: SystemIds.TABLE_VIEW, value: 'TABLE' },
  { name: 'Gallery', id: SystemIds.GALLERY_VIEW, value: 'GALLERY' },
  { name: 'List', id: SystemIds.LIST_VIEW, value: 'LIST' },
  { name: 'Bullet List', id: SystemIds.BULLETED_LIST_VIEW, value: 'BULLETED_LIST' },
];

const RANKING_ONLY_VIEWS: Array<DataBlockViewDetails> = [
  { name: 'Pill', id: RANKING_VIEW_PILL_ID, value: 'PILL' },
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
    <MenuItem active={isActive} onClick={isActive ? undefined : onToggleView}>
      <div className="flex w-full items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <ViewIcon view={view.value} color="text" />
          <span className="whitespace-nowrap">{view.name}</span>
        </div>
        {isActive ? <Check /> : null}
      </div>
    </MenuItem>
  );
};
