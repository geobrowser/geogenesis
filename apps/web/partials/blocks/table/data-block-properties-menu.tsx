'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { useView } from '~/core/blocks/data/use-view';
import { getSchemaFromTypeIds } from '~/core/database/entities';
import { useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { Dots } from '~/design-system/dots';
import { Eye } from '~/design-system/icons/eye';
import { EyeHide } from '~/design-system/icons/eye-hide';
import { Input } from '~/design-system/input';

type Column = {
  id: string;
  name: string | null;
};

function DragHandle() {
  return <span className="text-grey-03">::</span>;
}

type Props = {
  disabled?: boolean;
};

export function DataBlockPropertiesMenu({ disabled = false }: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const { filterState, setFilterState } = useFilters();
  const { source } = useSource({ filterState, setFilterState });
  const { shownColumnIds, toggleProperty, reorderShownColumns } = useView();
  const { spaceId } = useDataBlockInstance();

  const { data: availableColumns = [], isLoading } = useQuery({
    queryKey: ['data-block-properties-columns', filterState, spaceId],
    queryFn: async () => {
      const typeFilters = filterState.filter(f => f.columnId === SystemIds.TYPES_PROPERTY).map(f => ({ id: f.value }));
      const scopedSpaceIds = filterState.filter(f => f.columnId === SystemIds.SPACE_FILTER).map(f => f.value);
      if (!scopedSpaceIds.includes(spaceId)) scopedSpaceIds.push(spaceId);
      return await getSchemaFromTypeIds(typeFilters, scopedSpaceIds);
    },
    enabled: open,
  });

  const columnsById = React.useMemo(() => {
    const map = new Map<string, Column>();
    map.set(SystemIds.NAME_PROPERTY, { id: SystemIds.NAME_PROPERTY, name: 'Name' });
    for (const column of availableColumns) {
      map.set(column.id, column);
    }
    return map;
  }, [availableColumns]);

  const orderedShownColumns = React.useMemo(
    () =>
      shownColumnIds
        .map(id => columnsById.get(id) ?? { id, name: id })
        .filter(column => Boolean(column.name)),
    [shownColumnIds, columnsById]
  );

  const hiddenColumns = React.useMemo(() => {
    const shownSet = new Set(shownColumnIds);
    return [...columnsById.values()]
      .filter(column => !shownSet.has(column.id))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [columnsById, shownColumnIds]);

  const normalizedQuery = query.trim().toLowerCase();
  const filterByQuery = React.useCallback(
    (column: Column) => {
      if (!normalizedQuery) return true;
      return (column.name ?? '').toLowerCase().includes(normalizedQuery);
    },
    [normalizedQuery]
  );

  const shownFiltered = orderedShownColumns.filter(filterByQuery);
  const hiddenFiltered = hiddenColumns.filter(filterByQuery);
  const shownNameColumn = shownFiltered.find(column => column.id === SystemIds.NAME_PROPERTY) ?? null;
  const shownReorderableColumns = orderedShownColumns.filter(column => column.id !== SystemIds.NAME_PROPERTY);
  const shownFilteredReorderableColumns = shownFiltered.filter(column => column.id !== SystemIds.NAME_PROPERTY);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = shownReorderableColumns.findIndex(column => column.id === active.id);
    const newIndex = shownReorderableColumns.findIndex(column => column.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(shownReorderableColumns, oldIndex, newIndex);
    reorderShownColumns([SystemIds.NAME_PROPERTY, ...reordered.map(column => column.id)]);
  };

  if (source.type === 'RELATIONS') {
    return null;
  }

  return (
    <Dropdown.Root open={open} onOpenChange={setOpen}>
      <Dropdown.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded bg-white text-grey-04 transition hover:text-text disabled:pointer-events-none disabled:opacity-50"
          aria-label="Set properties"
          title="Set properties"
        >
          <Eye color="grey-04" />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={8}
          align="start"
          className="z-1001 w-[320px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
        >
          <div className="border-b border-grey-02 p-2">
            <Input withSearchIcon placeholder="Search for a property..." value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          {isLoading ? (
            <div className="flex h-16 items-center justify-center">
              <Dots />
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <section className="px-2 py-2">
                <div className="mb-1 flex items-center justify-between text-footnoteMedium text-grey-04">
                  <span>Shown in table</span>
                </div>
                <div className="space-y-0.5">
                  {shownNameColumn && (
                    <div className="group flex h-8 w-full items-center gap-2 rounded px-2 text-left text-button text-text">
                      <span className="text-grey-03">
                        <DragHandle />
                      </span>
                      <span className="grow truncate">{shownNameColumn.name}</span>
                      <span>
                        <Eye color="grey-04" />
                      </span>
                    </div>
                  )}
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext
                      items={shownFilteredReorderableColumns.map(column => column.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {shownFilteredReorderableColumns.map(column => (
                        <SortableShownColumnRow key={column.id} column={column} onToggle={() => toggleProperty(column)} />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              </section>

              <section className="border-t border-grey-02 px-2 py-2">
                <div className="mb-1 flex items-center justify-between text-footnoteMedium text-grey-04">
                  <span>Hidden in table</span>
                </div>
                <div className="space-y-0.5">
                  {hiddenFiltered.map(column => (
                    <button
                      key={column.id}
                      type="button"
                      className="group flex h-8 w-full items-center gap-2 rounded px-2 text-left text-button text-text transition-colors hover:bg-grey-01"
                      onClick={() => toggleProperty(column)}
                    >
                      <DragHandle />
                      <span className="grow truncate">{column.name}</span>
                      <span>
                        <EyeHide color="grey-04" />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function SortableShownColumnRow({ column, onToggle }: { column: Column; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group flex h-8 w-full items-center gap-2 rounded px-2 text-left text-button text-text transition-colors hover:bg-grey-01">
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing"
        aria-label={`Reorder ${column.name ?? 'property'}`}
        {...attributes}
        {...listeners}
      >
        <DragHandle />
      </button>
      <button type="button" className="flex grow items-center justify-between gap-2 text-left" onClick={onToggle}>
        <span className="grow truncate">{column.name}</span>
        <span>
          <Eye color="grey-04" />
        </span>
      </button>
    </div>
  );
}

