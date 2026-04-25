'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import type { Source } from '~/core/blocks/data/source';
import { ID } from '~/core/id';
import { editingPropertiesAtom } from '~/atoms';
import { Property, Relation } from '~/core/types';

import { IconButton } from '~/design-system/button';
import { Eye } from '~/design-system/icons/eye';
import { EyeHide } from '~/design-system/icons/eye-hide';
import { OrderDots } from '~/design-system/icons/order-dots';
import { Input } from '~/design-system/input';

const panelClassName =
  'z-1001 flex max-h-[min(480px,80vh)] w-[min(320px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-grey-02 bg-white text-text shadow-lg';

const sectionHeaderClass = 'flex items-center justify-between px-2.5 py-1.5 text-footnoteMedium text-grey-04';

const rowClass =
  'flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-sm text-text hover:bg-bg';

type TableBlockPropertiesMenuProps = {
  sourceType: Source['type'];
  filterableProperties: Property[];
  shownColumnIds: string[];
  orderedShownColumnRelations: Relation[];
  toggleProperty: (column: { id: string; name: string | null }) => void;
  hideAllShownPropertyColumns: () => void;
  reorderShownPropertyRelations: (fromIndex: number, toIndex: number) => void;
  disabled?: boolean;
};

function SortablePropertyRow({
  id,
  label,
  isShown,
  onToggleVisibility,
  dragDisabled,
}: {
  id: string;
  label: string;
  isShown: boolean;
  onToggleVisibility: () => void;
  dragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: dragDisabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={rowClass}>
      <button
        type="button"
        className="inline-flex h-6 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded p-0.5 text-grey-04 hover:bg-bg active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
        aria-label="Reorder"
        disabled={dragDisabled}
        {...attributes}
        {...listeners}
      >
        <OrderDots color="grey-04" className="shrink-0" />
      </button>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onToggleVisibility();
        }}
        className="inline-flex shrink-0 rounded p-0.5 text-grey-04 hover:bg-bg hover:text-text"
        aria-label={isShown ? 'Hide in table' : 'Show in table'}
      >
        {isShown ? <Eye color="grey-04" /> : <EyeHide color="grey-04" />}
      </button>
    </div>
  );
}

export function TableBlockPropertiesMenu({
  sourceType,
  filterableProperties,
  shownColumnIds,
  orderedShownColumnRelations,
  toggleProperty,
  hideAllShownPropertyColumns,
  reorderShownPropertyRelations,
  disabled,
}: TableBlockPropertiesMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const setEditingProperties = useSetAtom(editingPropertiesAtom);

  React.useEffect(() => {
    setEditingProperties(open);
  }, [open, setEditingProperties]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch('');
  };

  const hiddenProperties = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const isShown = (propertyId: string) => shownColumnIds.some(sid => ID.equals(sid, propertyId));
    return filterableProperties.filter(p => {
      if (ID.equals(p.id, SystemIds.NAME_PROPERTY)) return false;
      if (isShown(p.id)) return false;
      if (!q) return true;
      return (p.name ?? p.id).toLowerCase().includes(q);
    });
  }, [filterableProperties, shownColumnIds, search]);

  const shownRelationIds = orderedShownColumnRelations.map(r => r.id);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = shownRelationIds.indexOf(String(active.id));
    const newIndex = shownRelationIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorderShownPropertyRelations(oldIndex, newIndex);
  };

  const showAll = () => {
    const isShown = (propertyId: string) => shownColumnIds.some(sid => ID.equals(sid, propertyId));
    const toAdd = filterableProperties.filter(
      p => !ID.equals(p.id, SystemIds.NAME_PROPERTY) && !isShown(p.id)
    );
    toAdd.forEach((col, i) => {
      window.setTimeout(() => toggleProperty({ id: col.id, name: col.name }), i);
    });
  };

  if (sourceType === 'RELATIONS') {
    return null;
  }

  return (
    <Dropdown.Root open={open} onOpenChange={onOpenChange}>
      <Dropdown.Trigger asChild disabled={disabled}>
        <IconButton icon={<Eye color="grey-04" />} color="grey-04" aria-label="Table properties" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content sideOffset={8} align="end" className={panelClassName} onCloseAutoFocus={e => e.preventDefault()}>
          <div className="shrink-0 border-b border-grey-02 bg-white p-2">
            <Input
              withSearchIcon
              placeholder="Search for a property..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={sectionHeaderClass}>
              <span>Shown in table</span>
              <button
                type="button"
                onClick={hideAllShownPropertyColumns}
                className="text-footnoteMedium text-sky-400 hover:text-sky-300"
              >
                Hide all
              </button>
            </div>
            <div className="px-1 pb-2">
              <div className={rowClass}>
                <span className="inline-flex w-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">Name</span>
                <span className="inline-flex shrink-0 text-grey-04" aria-hidden>
                  <Eye color="grey-04" />
                </span>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={shownRelationIds} strategy={verticalListSortingStrategy}>
                  {orderedShownColumnRelations.map(rel => (
                    <SortablePropertyRow
                      key={rel.id}
                      id={rel.id}
                      label={rel.toEntity.name ?? rel.toEntity.id}
                      isShown
                      onToggleVisibility={() => toggleProperty({ id: rel.toEntity.id, name: rel.toEntity.name })}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>

            <div className={sectionHeaderClass}>
              <span>Hidden in table</span>
              <button
                type="button"
                onClick={showAll}
                className="text-footnoteMedium text-sky-400 hover:text-sky-300"
              >
                Show all
              </button>
            </div>
            <div className="px-1 pb-2">
              {hiddenProperties.length === 0 ? (
                <p className="px-2 py-2 text-footnote text-grey-04">No matching properties.</p>
              ) : (
                hiddenProperties.map(p => (
                  <div key={p.id} className={rowClass}>
                    <span className="inline-flex w-5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{p.name ?? p.id}</span>
                    <button
                      type="button"
                      onClick={() => toggleProperty({ id: p.id, name: p.name })}
                      className="inline-flex shrink-0 rounded p-0.5 text-grey-04 hover:bg-bg hover:text-text"
                      aria-label="Show in table"
                    >
                      <EyeHide color="grey-04" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
