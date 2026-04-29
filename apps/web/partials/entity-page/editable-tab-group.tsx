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

import React, { useEffect, useRef, useState } from 'react';

import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { usePathname, useRouter } from 'next/navigation';

import { ID } from '~/core/id';
import { useTabId } from '~/core/state/editor/use-editor';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelations, getValues } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { EditSmall } from '~/design-system/icons/edit-small';
import { ExpandSmall } from '~/design-system/icons/expand-small';
import { Menu } from '~/design-system/icons/menu';
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
      // 8px matches table-block-dnd-items.tsx and avoids click-becomes-drag jitter on trackpads.
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
    const tabsRelationId = ID.createEntityId();
    const tabsRelationEntityId = ID.createEntityId();
    const typesRelationId = ID.createEntityId();
    const typesRelationEntityId = ID.createEntityId();

    // Set name for the new tab entity
    storage.entities.name.set(tabEntityId, spaceId, '');

    // Always append after the last existing tab — callers may have reordered,
    // so Position.generate() alone would not guarantee end-of-list placement.
    const lastPosition = editableTabs.length > 0 ? editableTabs[editableTabs.length - 1].relation.position : null;

    // Create the TABS_PROPERTY relation
    storage.relations.set({
      id: tabsRelationId,
      entityId: tabsRelationEntityId,
      spaceId,
      renderableType: 'RELATION',
      verified: false,
      position: Position.generateBetween(lastPosition ?? null, null),
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

    // Type the new tab entity as a Page so it renders with the correct schema.
    storage.relations.set({
      id: typesRelationId,
      entityId: typesRelationEntityId,
      spaceId,
      renderableType: 'RELATION',
      verified: false,
      position: Position.generate(),
      type: {
        id: SystemIds.TYPES_PROPERTY,
        name: 'Types',
      },
      fromEntity: {
        id: tabEntityId,
        name: null,
      },
      toEntity: {
        id: SystemIds.PAGE_TYPE,
        name: 'Page',
        value: SystemIds.PAGE_TYPE,
      },
    });

    // Navigate to the new tab so it becomes the active tab, and enter rename mode.
    // `scroll: false` keeps the user's current scroll position.
    router.replace(`${overviewHref}?tabId=${tabEntityId}`, { scroll: false });
    setEditingTabId(tabEntityId);
  };

  const handleDeleteTab = (tab: EditableTab) => {
    const tabEntityId = tab.entityId;

    // Mirrors the deleteEntityFromSource pattern in entity-to-space-dialog.tsx: the tab entity's
    // own values/relations are scoped to the current spaceId, while orphan checks and deletion for
    // block entities intentionally use global selectors so we only remove blocks that are truly unused.
    const tabValues = getValues({
      selector: v => v.entity.id === tabEntityId && v.spaceId === spaceId,
    });
    const outgoingRelations = getRelations({
      selector: r => r.fromEntity.id === tabEntityId && r.spaceId === spaceId,
    });

    // Find block entities the tab owns via BLOCKS relations in this space.
    const blockIds = [
      ...new Set(outgoingRelations.filter(r => r.type.id === SystemIds.BLOCKS).map(r => r.toEntity.id)),
    ];

    // A block is orphaned once the tab's BLOCKS relation (in this space) is removed and nothing else points to it.
    const orphanedBlockIds = blockIds.filter(blockId => {
      const remainingRefs = getRelations({
        selector: r =>
          r.toEntity.id === blockId &&
          !(r.fromEntity.id === tabEntityId && r.type.id === SystemIds.BLOCKS && r.spaceId === spaceId),
      });
      return remainingRefs.length === 0;
    });

    const relationIds = new Set<string>();
    const allRelationsToDelete: typeof outgoingRelations = [];
    for (const r of [
      ...outgoingRelations,
      ...getRelations({ selector: r => r.toEntity.id === tabEntityId && r.spaceId === spaceId }),
    ]) {
      if (!relationIds.has(r.id)) {
        relationIds.add(r.id);
        allRelationsToDelete.push(r);
      }
    }
    const allValuesToDelete = [...tabValues];

    for (const blockId of orphanedBlockIds) {
      allValuesToDelete.push(...getValues({ selector: v => v.entity.id === blockId }));
      for (const r of getRelations({
        selector: r => r.fromEntity.id === blockId || r.toEntity.id === blockId,
      })) {
        if (!relationIds.has(r.id)) {
          relationIds.add(r.id);
          allRelationsToDelete.push(r);
        }
      }
    }

    // Batch the deletes so the UI only flashes once.
    storage.values.deleteMany(allValuesToDelete);
    storage.relations.deleteMany(allRelationsToDelete);

    // If the deleted tab is currently active, navigate to overview
    if (tabId === tab.entityId) {
      router.replace(overviewHref, { scroll: false });
    }
  };

  const handleRenameTab = (tab: EditableTab, newName: string) => {
    storage.entities.name.set(tab.entityId, spaceId, newName);
    setEditingTabId(null);
  };

  const activeTab = activeId ? editableTabs.find(t => t.relation.id === activeId) : null;
  const isAnyDragging = activeId !== null;

  // Stable array identity for SortableContext so drag doesn't re-register items on every render.
  // Key the memo on a joined string so we only allocate a new array when the id set actually changes.
  const sortableIdsKey = editableTabs.map(t => t.relation.id).join(',');
  const sortableIds = React.useMemo(() => (sortableIdsKey === '' ? [] : sortableIdsKey.split(',')), [sortableIdsKey]);

  return (
    <div className="relative">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        autoScroll={false}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div
          className={cx(
            'relative z-0 overflow-x-auto overflow-y-clip',
            '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            className
          )}
        >
          <div className="relative z-10 flex w-max items-center gap-6 pb-2">
            {systemTabsBefore.map(tab => (
              <StaticTab key={tab.href} href={tab.href} label={tab.label} active={tab.href === fullPath} />
            ))}

            <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
              {editableTabs.map(tab => (
                <SortableTab
                  key={tab.relation.id}
                  tab={tab}
                  active={tab.href === fullPath}
                  isAnyDragging={isAnyDragging}
                  isEditing={editingTabId === tab.entityId}
                  onStartEditing={() => setEditingTabId(tab.entityId)}
                  onRename={newName => handleRenameTab(tab, newName)}
                  onCancelEditing={() => setEditingTabId(null)}
                  onDelete={() => handleDeleteTab(tab)}
                  onOpen={() => router.push(NavUtils.toEntity(tab.relation.spaceId, tab.entityId))}
                />
              ))}
            </SortableContext>

            {systemTabsAfter.map(tab => (
              <StaticTab key={tab.href} href={tab.href} label={tab.label} active={tab.href === fullPath} />
            ))}

            <button
              type="button"
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
      {active && <div className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text" />}
    </Link>
  );
}

type SortableTabProps = {
  tab: EditableTab;
  active: boolean;
  isAnyDragging: boolean;
  isEditing: boolean;
  onStartEditing: () => void;
  onRename: (name: string) => void;
  onCancelEditing: () => void;
  onDelete: () => void;
  onOpen: () => void;
};

function SortableTab({
  tab,
  active,
  isAnyDragging,
  isEditing,
  onStartEditing,
  onRename,
  onCancelEditing,
  onDelete,
  onOpen,
}: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.relation.id,
    // Snappier easing than dnd-kit's default 250ms cubic — neighbors settle into their new slot
    // much closer to the pointer so the reorder feels tighter.
    transition: { duration: 150, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    willChange: 'transform',
  };

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [align, setAlign] = useState<'start' | 'end'>('start');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  // Align 'start' when the trigger is in the left half of the viewport, 'end' otherwise.
  const updateAlign = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const triggerCenter = rect.left + rect.width / 2;
      setAlign(triggerCenter < window.innerWidth / 2 ? 'start' : 'end');
    }
  };

  const openPopover = () => {
    cancelClose();
    updateAlign();
    setIsPopoverOpen(true);
  };

  // Also recompute alignment for non-hover opens (click, keyboard) that go through Radix's
  // onOpenChange instead of our hover handler.
  const handleOpenChange = (open: boolean) => {
    if (open) {
      // Cancel any pending close so a stale mouseleave timeout can't snap the menu shut after open.
      cancelClose();
      updateAlign();
    }
    setIsPopoverOpen(open);
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimeoutRef.current = setTimeout(() => setIsPopoverOpen(false), 200);
  };

  // Clear any pending close timeout if the tab unmounts (e.g., after a route change)
  // so it doesn't try to setState on an unmounted component. Inlined rather than calling
  // cancelClose to keep the effect's dep array honest with react-hooks/exhaustive-deps.
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  // Suppress the click that fires on pointer-up after a drag, so reordering a tab
  // doesn't navigate. Mirrors the justDragged pattern in table-block-dnd-items.tsx.
  const [justDragged, setJustDragged] = useState(false);
  useEffect(() => {
    if (isDragging) {
      setJustDragged(true);
    } else if (justDragged) {
      const t = setTimeout(() => setJustDragged(false), 200);
      return () => clearTimeout(t);
    }
  }, [isDragging, justDragged]);

  const handleLinkClick = (e: React.MouseEvent) => {
    if (justDragged) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // tab.name already includes the live name via EntityTabs' liveNameMap, so no per-tab subscription needed here.
  const displayName = tab.name;

  return (
    <div ref={setNodeRef} style={style} className="group/tab relative flex items-center">
      {isEditing ? (
        <TabNameInput initialValue={displayName} onSubmit={onRename} onCancel={onCancelEditing} />
      ) : (
        <Link
          className={cx(tabStyles({ active }), 'cursor-grab touch-none select-none active:cursor-grabbing')}
          href={tab.href}
          prefetch
          onClick={handleLinkClick}
          {...attributes}
          {...listeners}
        >
          {displayName || 'Untitled'}
          {active && <div className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text" />}
        </Link>
      )}

      {/* Action menu — absolute so it doesn't push neighboring tabs apart.
          Skip rendering entirely during any drag so the Popover tree doesn't re-reconcile on every drag tick. */}
      {!isEditing && !isDragging && !isAnyDragging && (
        <div
          className={cx(
            'absolute top-1/2 left-full z-20 ml-3 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-150',
            isPopoverOpen ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100'
          )}
        >
          <Popover.Root open={isPopoverOpen} onOpenChange={handleOpenChange}>
            <Popover.Trigger asChild>
              <button
                ref={triggerRef}
                type="button"
                aria-label="Tab actions"
                title="Tab actions"
                onMouseEnter={openPopover}
                onMouseLeave={scheduleClose}
                onMouseDown={e => e.preventDefault()}
                className="text-grey-03 transition duration-200 hover:text-text"
              >
                <Menu />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="bottom"
                align={align}
                sideOffset={8}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
                className="z-100 rounded-lg border border-grey-02 bg-white p-1 shadow-lg"
                onOpenAutoFocus={e => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <MenuItem
                  onClick={() => {
                    setIsPopoverOpen(false);
                    onStartEditing();
                  }}
                  icon={<EditSmall />}
                  label="Edit name"
                />
                <MenuItem
                  onClick={() => {
                    setIsPopoverOpen(false);
                    onDelete();
                  }}
                  icon={<Trash color="red-01" />}
                  label="Delete tab"
                  tone="danger"
                />
                <MenuItem
                  onClick={() => {
                    setIsPopoverOpen(false);
                    onOpen();
                  }}
                  icon={<ExpandSmall />}
                  label="Open tab"
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  label,
  tone = 'default',
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-smallButton transition-colors hover:bg-grey-01',
        tone === 'danger' ? 'text-red-01' : 'text-text'
      )}
    >
      <span className="flex w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

type TabNameInputProps = {
  initialValue: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
};

function TabNameInput({ initialValue, onSubmit, onCancel }: TabNameInputProps) {
  const [value, setValue] = useState(initialValue);
  const placeholder = 'Add tab...';
  // The hidden sizer renders the same text the input shows, so the input's width
  // tracks the rendered glyph width rather than ch units (which over-estimate narrow text).
  const sizerText = value.length > 0 ? value : placeholder;

  return (
    <span className="relative z-10 inline-block text-quoteMedium">
      <span aria-hidden="true" className="invisible whitespace-pre">
        {sizerText}
      </span>
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
        className="absolute inset-0 bg-transparent text-text outline-none placeholder:text-grey-03"
        placeholder={placeholder}
      />
    </span>
  );
}
