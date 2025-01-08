'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_RELATION_INDEX_VALUE } from '@geogenesis/sdk/constants';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { motion } from 'framer-motion';

import * as React from 'react';
import { useCallback } from 'react';

import { StoreRelation } from '~/core/database/types';
import { DB } from '~/core/database/write';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { EntityId } from '~/core/io/schema';
import { useTableBlock } from '~/core/state/table-block-store';
import type { DataBlockView } from '~/core/state/table-block-store';
import { Relation } from '~/core/types';

import { Check } from '~/design-system/icons/check';
import { Close } from '~/design-system/icons/close';
import { GalleryView } from '~/design-system/icons/gallery-view';
import { ListView } from '~/design-system/icons/list-view';
import { TableView } from '~/design-system/icons/table-view';
import { MenuItem } from '~/design-system/menu';
import { ColorName } from '~/design-system/theme/colors';

const MotionContent = motion(Dropdown.Content);

type TableBlockViewMenuProps = {
  activeView: DataBlockView;
  viewRelation?: Relation;
  isLoading: boolean;
};

export function DataBlockViewMenu({ activeView, isLoading }: TableBlockViewMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const { spaceId, relationId, viewRelation } = useTableBlock();

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
        <MotionContent
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{
            duration: 0.1,
            ease: 'easeInOut',
          }}
          sideOffset={8}
          className="z-100 block !w-[140px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
          align="end"
        >
          {DATA_BLOCK_VIEWS.map(view => {
            return (
              <ToggleView
                key={view.value}
                spaceId={spaceId}
                activeView={activeView}
                view={view}
                viewRelation={viewRelation}
                relationId={relationId}
                isLoading={isLoading}
              />
            );
          })}
        </MotionContent>
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
  }
}

type DataBlockViewDetails = { name: string; id: string; value: DataBlockView };

const DATA_BLOCK_VIEWS: Array<DataBlockViewDetails> = [
  { name: 'Table', id: SYSTEM_IDS.TABLE_VIEW, value: 'TABLE' },
  { name: 'Gallery', id: SYSTEM_IDS.GALLERY_VIEW, value: 'GALLERY' },
  { name: 'List', id: SYSTEM_IDS.LIST_VIEW, value: 'LIST' },
];

type ToggleViewProps = {
  spaceId: string;
  relationId: string;
  activeView: DataBlockView;
  view: DataBlockViewDetails;
  viewRelation?: Relation;
  isLoading: boolean;
};

const ToggleView = ({ spaceId, activeView, view, viewRelation, relationId, isLoading }: ToggleViewProps) => {
  const isActive = !isLoading && activeView === view.value;

  const onToggleView = useCallback(async () => {
    if (!isActive) {
      if (viewRelation) {
        DB.removeRelation({ relationId: viewRelation.id, spaceId });
      }

      const newRelation: StoreRelation = {
        space: spaceId,
        index: INITIAL_RELATION_INDEX_VALUE,
        typeOf: {
          id: EntityId(SYSTEM_IDS.VIEW_ATTRIBUTE),
          name: 'View',
        },
        fromEntity: {
          id: EntityId(relationId),
          name: '',
        },
        toEntity: {
          id: EntityId(view.id),
          name: view.name,
          renderableType: 'RELATION',
          value: EntityId(view.id),
        },
      };

      DB.upsertRelation({
        relation: newRelation,
        spaceId,
      });
    }
  }, [isActive, relationId, spaceId, view.id, view.name, viewRelation]);

  return (
    <MenuItem active={isActive}>
      <button onClick={onToggleView} className="flex w-full items-center justify-between gap-2" disabled={isActive}>
        <div className="inline-flex items-center gap-2">
          <ViewIcon view={view.value} color="text" />
          <span>{view.name}</span>
        </div>
        {isActive ? <Check /> : null}
      </button>
    </MenuItem>
  );
};
