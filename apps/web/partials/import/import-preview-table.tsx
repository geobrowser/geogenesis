'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { useVirtualizer } from '@tanstack/react-virtual';

import * as React from 'react';
import { useMemo, useState } from 'react';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Search } from '~/design-system/icons/search';
import { Text } from '~/design-system/text';

const ROW_HEIGHT_ESTIMATE = 56;
/** Two-line header: property name + CSV column / Needs mapping */
const HEADER_HEIGHT = 56;
const DEFAULT_COLUMN_WIDTH = 200;

/** CSV-centric column: one column per CSV column so data aligns with headers. */
export type ColumnConfig = {
  /** CSV column index (0-based) — cell value is always row[csvColumnIndex] */
  csvColumnIndex: number;
  /** CSV header label for this column */
  headerLabel: string;
  /** Mapped schema property name, or null to show "Needs mapping" */
  propertyName: string | null;
};

export type SchemaProperty = { id: string; name: string | null };

function MappingColumnDropdown({
  headerLabel,
  schema,
  csvColumnIndex,
  onSelectProperty,
  onRequestCreateProperty,
  trigger,
}: {
  headerLabel: string;
  schema: SchemaProperty[];
  csvColumnIndex: number;
  onSelectProperty: (csvColumnIndex: number, propertyId: string) => void;
  onRequestCreateProperty?: (csvColumnIndex: number) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return schema;
    return schema.filter(
      p => (p.name ?? p.id).toLowerCase().includes(q)
    );
  }, [schema, search]);

  const handleSelect = (propertyId: string) => {
    onSelectProperty(csvColumnIndex, propertyId);
    setOpen(false);
    setSearch('');
  };

  const handleCreate = () => {
    onRequestCreateProperty?.(csvColumnIndex);
    setOpen(false);
    setSearch('');
  };

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger asChild>
        <span className="mt-0.5 flex cursor-pointer items-center gap-1.5 rounded hover:bg-grey-02/50">
          {trigger}
          <span className="shrink-0">
            <ChevronDownSmall color="ctaPrimary" />
          </span>
        </span>
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Content
          align="start"
          sideOffset={2}
          className="z-10 min-w-[280px] origin-top-left overflow-hidden rounded border border-grey-02 bg-white shadow-lg"
          onCloseAutoFocus={e => e.preventDefault()}
        >
          <div className="border-b border-grey-02 p-2">
            <div className="flex items-center gap-2 rounded bg-grey-01 px-2 py-1.5">
              <span className="shrink-0">
                <Search color="grey-04" />
              </span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={headerLabel}
                className="min-w-0 flex-1 bg-transparent text-button text-text placeholder:text-grey-04 focus:outline-none"
                autoFocus
              />
            </div>
          </div>
          <DropdownPrimitive.Group className="max-h-[240px] overflow-y-auto">
            {filtered.map(p => (
              <DropdownPrimitive.Item
                key={p.id}
                onSelect={() => handleSelect(p.id)}
                className="flex cursor-pointer items-center gap-2 border-b border-b-grey-02 px-3 py-2 text-button text-grey-04 last:border-none hover:bg-grey-01 hover:text-text focus:bg-grey-01 focus:text-text focus:outline-none"
              >
                <span className="inline-flex h-4 w-4 shrink-0 rounded-full bg-purple/20" aria-hidden />
                {p.name ?? p.id}
              </DropdownPrimitive.Item>
            ))}
          </DropdownPrimitive.Group>
          {onRequestCreateProperty && (
            <div className="border-t border-grey-02 p-2">
              <button
                type="button"
                onClick={handleCreate}
                className="w-full rounded px-3 py-2 text-left text-button text-text hover:bg-grey-01 focus:bg-grey-01 focus:outline-none"
              >
                Create new
              </button>
            </div>
          )}
        </DropdownPrimitive.Content>
    </DropdownPrimitive.Root>
  );
}

type Props = {
  /** CSV data rows (excluding header). records[row][columnIndex] */
  dataRows: Array<Array<string>>;
  columns: ColumnConfig[];
  /** Optional min height for the scroll container (e.g. 400px) */
  minHeight?: number;
  /** When provided, "Needs mapping" columns show a dropdown to pick or create a property */
  schema?: SchemaProperty[];
  onSelectProperty?: (csvColumnIndex: number, propertyId: string) => void;
  /** When provided, dropdown shows "Create new property" and calls this when selected */
  onRequestCreateProperty?: (csvColumnIndex: number) => void;
};

export function ImportPreviewTable({
  dataRows,
  columns,
  minHeight = 400,
  schema = [],
  onSelectProperty,
  onRequestCreateProperty,
}: Props) {
  const tableRef = React.useRef<HTMLDivElement>(null);

  const columnLayout = React.useMemo(() => {
    const template = columns.map(() => `${DEFAULT_COLUMN_WIDTH}px`).join(' ');
    const totalWidth = columns.length * DEFAULT_COLUMN_WIDTH;
    return { template, totalWidth };
  }, [columns]);

  const rowVirtualizer = useVirtualizer({
    count: dataRows.length,
    getScrollElement: () => tableRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 8,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  if (columns.length === 0) {
    return null;
  }

  return (
    <div
      ref={tableRef}
      className="w-full overflow-auto rounded-lg border border-grey-02 bg-white"
      style={{ minHeight }}
    >
      <div className="shadow-sm sticky top-0 z-10 bg-white">
        <div
          className="grid border-b border-grey-02 bg-grey-01"
          style={{
            minHeight: HEADER_HEIGHT,
            minWidth: columnLayout.totalWidth,
            gridTemplateColumns: columnLayout.template,
          }}
        >
          {columns.map(col => (
            <div
              key={col.csvColumnIndex}
              className="relative flex min-h-[56px] flex-col justify-center border-r border-grey-02 bg-grey-01 px-3 py-2"
            >
              <Text variant="metadata" className="truncate font-semibold text-text">
                {col.headerLabel}
              </Text>
              {col.propertyName !== null ? (
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className="inline-flex h-4 w-4 shrink-0 rounded-full bg-purple/20" aria-hidden />
                  <Text variant="metadata" className="truncate text-purple">
                    {col.propertyName}
                  </Text>
                </span>
              ) : onSelectProperty && schema.length > 0 ? (
                <MappingColumnDropdown
                  headerLabel={col.headerLabel}
                  schema={schema}
                  csvColumnIndex={col.csvColumnIndex}
                  onSelectProperty={onSelectProperty}
                  onRequestCreateProperty={onRequestCreateProperty}
                  trigger={
                    <span className="flex items-center gap-1.5">
                      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-01 text-[10px] font-semibold text-white">
                        !
                      </span>
                      <Text variant="metadata" className="text-text">Needs mapping</Text>
                    </span>
                  }
                />
              ) : (
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-01 text-[10px] font-semibold text-white">
                    !
                  </span>
                  <Text variant="metadata" className="text-text">Needs mapping</Text>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: 'relative',
          minWidth: columnLayout.totalWidth,
        }}
      >
        {virtualRows.map(virtualRow => {
          const row = dataRows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={node => rowVirtualizer.measureElement(node)}
              className="absolute left-0 top-0 border-b border-grey-02 bg-grey-01/50 hover:bg-grey-01"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                width: '100%',
                zIndex: 1,
              }}
            >
              <div
                className="grid"
                style={{
                  minWidth: columnLayout.totalWidth,
                  gridTemplateColumns: columnLayout.template,
                }}
              >
                {columns.map(col => {
                  const value = row[col.csvColumnIndex] ?? '';
                  return (
                    <div
                      key={`${virtualRow.index}-${col.csvColumnIndex}`}
                      className="border-r border-grey-02 px-4 py-2"
                    >
                      <div className="flex w-full items-start gap-2 overflow-hidden">
                        <Text variant="metadata" className="min-w-0 truncate text-text">
                          {value || '—'}
                        </Text>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
