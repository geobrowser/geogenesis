'use client';

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';
import * as Popover from '@radix-ui/react-popover';

import React, { useState } from 'react';

import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { motion } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';

import { ID } from '~/core/id';
import { useTabId } from '~/core/state/editor/use-editor';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { useMutate } from '~/core/sync/use-mutate';
import type { Relation } from '~/core/types';

import { EditSmall } from '~/design-system/icons/edit-small';
import { Menu } from '~/design-system/icons/menu';
import { OrderDots } from '~/design-system/icons/order-dots';
import { Trash } from '~/design-system/icons/trash';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

export type SystemTab = {
  label: string;
  href: string;
};

export type EditableTab = {
  relation: Relation;
  entityId: string;
  name: string;
  href: string;
};

type EditableTabGroupProps = {
  entityId: string;
  spaceId: string;
  editableTabs: EditableTab[];
  systemTabsBefore?: SystemTab[];
  systemTabsAfter?: SystemTab[];
  overviewHref: string;
  className?: string;
};

const tabStyles = cva(
  'relative z-10 flex items-center gap-1.5 text-quoteMedium whitespace-nowrap transition-colors duration-100',
  {
    variants: {
      active: {
        true: 'text-text',
        false: 'text-grey-04 hover:text-text',
      },
    },
    defaultVariants: {
      active: false,
    },
  }
);

export function EditableTabGroup({
  entityId,
  spaceId,
  editableTabs,
  systemTabsBefore = [],
  systemTabsAfter = [],
  overviewHref,
  className = '',
}: EditableTabGroupProps) {
  const { storage } = useMutate();
  const router = useRouter();
  const path = usePathname();
  const tabId = useTabId();
  const fullPath = tabId ? `${path}?tabId=${tabId}` : path;

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const relations = editableTabs.map(t => t.relation);
    const oldIndex = relations.findIndex(r => r.id === active.id);
    const newIndex = relations.findIndex(r => r.id === over.id);

    // Swap positions: each item gets the position of whatever was at its new index
    const newList = arrayMove(relations, oldIndex, newIndex);
    newList.forEach((relation, index) => {
      storage.relations.update(relation, draft => {
        draft.position = relations[index].position;
      });
    });
  };

  const handleAddTab = () => {
    const tabEntityId = ID.createEntityId();
    const relationId = ID.createEntityId();
    const relationEntityId = ID.createEntityId();

    // Set name for the new tab entity
    storage.entities.name.set(tabEntityId, spaceId, '');

    // Create the TABS_PROPERTY relation
    storage.relations.set({
      id: relationId,
      entityId: relationEntityId,
      spaceId,
      renderableType: 'RELATION',
      verified: false,
      position: Position.generate(),
      type: {
        id: SystemIds.TABS_PROPERTY,
        name: 'Tabs',
      },
      fromEntity: {
        id: entityId,
        name: null,
      },
      toEntity: {
        id: tabEntityId,
        name: '',
        value: tabEntityId,
      },
    });

    // Auto-enter rename mode for the new tab
    setEditingTabId(tabEntityId);
  };

  const handleDeleteTab = (tab: EditableTab) => {
    storage.relations.delete(tab.relation);

    // If the deleted tab is currently active, navigate to overview
    if (tabId === tab.entityId) {
      router.replace(overviewHref);
    }
  };

  const handleRenameTab = (tab: EditableTab, newName: string) => {
    storage.entities.name.set(tab.entityId, spaceId, newName);
    setEditingTabId(null);
  };

  const activeTab = activeId ? editableTabs.find(t => t.relation.id === activeId) : null;

  return (
    <div className="relative">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className={cx(
            'relative z-0 overflow-x-auto overflow-y-clip',
            '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            className
          )}
        >
          <div className="relative flex w-max items-center gap-6 pb-2">
            {systemTabsBefore.map(tab => (
              <StaticTab key={tab.href} href={tab.href} label={tab.label} active={tab.href === fullPath} />
            ))}

            <SortableContext items={editableTabs.map(t => t.relation.id)} strategy={horizontalListSortingStrategy}>
              {editableTabs.map(tab => (
                <SortableTab
                  key={tab.relation.id}
                  tab={tab}
                  active={tab.href === fullPath}
                  isEditing={editingTabId === tab.entityId}
                  onStartEditing={() => setEditingTabId(tab.entityId)}
                  onRename={newName => handleRenameTab(tab, newName)}
                  onCancelEditing={() => setEditingTabId(null)}
                  onDelete={() => handleDeleteTab(tab)}
                />
              ))}
            </SortableContext>

            {systemTabsAfter.map(tab => (
              <StaticTab key={tab.href} href={tab.href} label={tab.label} active={tab.href === fullPath} />
            ))}

            <button
              onClick={handleAddTab}
              className="relative z-10 flex shrink-0 items-center gap-1 text-grey-04 transition-colors duration-100 hover:text-text"
              title="Add tab"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 1V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="absolute right-0 bottom-0 left-0 z-0 h-px bg-grey-02" />
        </div>

        <DragOverlay>
          {activeId && activeTab ? (
            <div className={tabStyles({ active: false })} style={{ cursor: 'grabbing' }}>
              {activeTab.name || 'Untitled'}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function StaticTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link className={tabStyles({ active })} href={href} prefetch>
      {label}
      {active && (
        <motion.div
          layoutId="tab-group-active-border"
          layout
          initial={false}
          transition={{ duration: 0.2 }}
          className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text"
        />
      )}
    </Link>
  );
}

type SortableTabProps = {
  tab: EditableTab;
  active: boolean;
  isEditing: boolean;
  onStartEditing: () => void;
  onRename: (name: string) => void;
  onCancelEditing: () => void;
  onDelete: () => void;
};

function SortableTab({
  tab,
  active,
  isEditing,
  onStartEditing,
  onRename,
  onCancelEditing,
  onDelete,
}: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.relation.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const liveName = useName(tab.entityId, tab.relation.spaceId);
  const displayName = liveName ?? tab.name;

  return (
    <div ref={setNodeRef} style={style} className="group/tab relative flex items-center">
      {/* Drag handle — absolute so it doesn't push neighboring tabs apart */}
      <div
        className="hover:text-grey-05 absolute top-1/2 right-full z-20 mr-0.5 flex -translate-y-1/2 cursor-grab touch-none items-center rounded p-0.5 text-grey-04 opacity-0 transition-opacity duration-150 group-hover/tab:opacity-100 hover:bg-grey-02 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <OrderDots color="currentColor" />
      </div>

      {isEditing ? (
        <TabNameInput initialValue={displayName} onSubmit={onRename} onCancel={onCancelEditing} />
      ) : (
        <Link className={tabStyles({ active })} href={tab.href} prefetch>
          {displayName || 'Untitled'}
          {active && (
            <motion.div
              layoutId="tab-group-active-border"
              layout
              initial={false}
              transition={{ duration: 0.2 }}
              className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text"
            />
          )}
        </Link>
      )}

      {/* Action menu — absolute so it doesn't push neighboring tabs apart */}
      {!isEditing && !isDragging && (
        <div className="absolute top-1/2 left-full z-20 ml-0.5 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover/tab:opacity-100">
          <Popover.Root open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
            <Popover.Trigger asChild>
              <button
                onMouseDown={e => e.preventDefault()}
                className="text-grey-03 transition duration-200 hover:text-text"
              >
                <Menu />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="bottom"
                sideOffset={8}
                className="z-100 min-w-[140px] rounded-lg border border-grey-02 bg-white p-1 shadow-lg"
                onOpenAutoFocus={e => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <button
                  onClick={() => {
                    setIsPopoverOpen(false);
                    onStartEditing();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-smallButton text-text transition-colors hover:bg-grey-01"
                >
                  <EditSmall />
                  Edit name
                </button>
                <button
                  onClick={() => {
                    setIsPopoverOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-smallButton text-red-01 transition-colors hover:bg-grey-01"
                >
                  <Trash color="red-01" />
                  Delete tab
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      )}
    </div>
  );
}

type TabNameInputProps = {
  initialValue: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
};

function TabNameInput({ initialValue, onSubmit, onCancel }: TabNameInputProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <input
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => onSubmit(value.trim())}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSubmit(value.trim());
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }}
      onFocus={e => e.currentTarget.select()}
      className="relative z-10 min-w-[40px] border-b border-text bg-transparent text-quoteMedium text-text outline-none"
      placeholder="Tab name..."
      style={{ width: `${Math.max(value.length, 6)}ch` }}
    />
  );
}
