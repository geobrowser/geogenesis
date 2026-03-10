'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Effect } from 'effect';

import * as React from 'react';

import { useCreateProperty } from '~/core/hooks/use-create-property';
import { getProperty } from '~/core/io/queries';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { Property } from '~/core/types';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useSpace } from '~/core/hooks/use-space';
import { useQueryEntity } from '~/core/sync/use-store';

import { GeoImage, NativeGeoImage } from '~/design-system/geo-image';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import { Text } from '~/design-system/text';

import type { UnresolvedImportCell } from './atoms';
import { splitRelationCell } from './relation-cell';

const ROW_HEIGHT_ESTIMATE = 56;
/** Two-line header: property name + CSV column / Needs mapping */
const HEADER_HEIGHT = 56;
const DEFAULT_COLUMN_WIDTH = 200;
const MIN_COLUMN_WIDTH = 100;

/** Red warning circle icon for truly unresolved items requiring manual resolution */
function WarningIcon() {
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-01 text-[10px] font-bold text-white"
      aria-label="Unresolved"
    >
      !
    </span>
  );
}

/** Yellow info circle icon for auto-ranked items the user can optionally review */
function RankedIcon() {
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange text-[10px] font-bold text-white"
      aria-label="Auto-selected"
    >
      i
    </span>
  );
}

/** Small colored status dot shown next to entity names in the Name column */
function StatusDot({ color }: { color: 'red' | 'orange' }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${color === 'red' ? 'bg-red-01' : 'bg-orange'}`}
      aria-hidden="true"
    />
  );
}

/** Grey colon separator shown on right side of chips */
function ChipSeparator() {
  return <span className="ml-1 text-grey-04" aria-hidden="true">:</span>;
}

/** Renders the space image for a property's source space (like the breadcrumb avatar) */
function PropertySpaceIcon({ propertyId }: { propertyId?: string | null }) {
  const { entity } = useQueryEntity({ id: propertyId ?? '', enabled: Boolean(propertyId) });
  const spaceId = entity?.spaces?.[0];
  const { space } = useSpace(spaceId);
  const image = space?.entity?.image;

  return (
    <div className="relative h-4 w-4 shrink-0 overflow-hidden rounded-sm">
      <GeoImage value={image || PLACEHOLDER_SPACE_IMAGE} alt="" style={{ objectFit: 'cover' }} fill />
    </div>
  );
}

/** Drag handle on the right edge of a column header to resize */
function ResizeHandle({ startWidth, onWidthChange }: { startWidth: number; onWidthChange: (width: number) => void }) {
  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const widthAtStart = startWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = Math.max(MIN_COLUMN_WIDTH, widthAtStart + (moveEvent.clientX - startX));
        onWidthChange(newWidth);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [startWidth, onWidthChange]
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-ctaPrimary/30"
    />
  );
}

/** CSV-centric column: one column per CSV column so data aligns with headers. */
export type ColumnConfig = {
  /** CSV column index (0-based) — cell value is always row[csvColumnIndex] */
  csvColumnIndex: number;
  /** CSV header label for this column */
  headerLabel: string;
  /** Mapped schema property name, or null to show "Needs mapping" */
  propertyName: string | null;
  /** Data type of the mapped property, used to render relation cells as chips */
  dataType?: string;
  /** Mapped property id for this CSV column (null when unmapped) */
  propertyId?: string | null;
  /** Allowed relation target types for this relation property */
  relationValueTypes?: Property['relationValueTypes'];
  /** True when this column mapping is implicit/derived and should not open mapping popover. */
  mappingLocked?: boolean;
  /** Renderable type strict — used to detect IMAGE columns for thumbnail rendering */
  renderableTypeStrict?: string | null;
};

function PropertyMappingPopover({
  spaceId,
  csvColumnIndex,
  onSelectProperty,
  onCreateProperty,
  trigger,
  initialQuery,
  selectedEntityId,
}: {
  spaceId: string;
  csvColumnIndex: number;
  onSelectProperty: (csvColumnIndex: number, propertyId: string, property: Property) => void;
  onCreateProperty?: (csvColumnIndex: number, propertyId: string, property: Property) => void;
  trigger: React.ReactNode;
  initialQuery?: string;
  selectedEntityId?: string;
}) {
  const { store } = useSyncEngine();
  const { createProperty } = useCreateProperty(spaceId);

  return (
    <SelectEntityAsPopover
      trigger={
        <span className="mt-0.5 flex cursor-pointer items-center gap-1.5 rounded hover:bg-grey-02/50">
          {trigger}
        </span>
      }
      spaceId={spaceId}
      relationValueTypes={[{ id: SystemIds.PROPERTY, name: 'Property' }]}
      placeholder="Find or create property..."
      advanced={false}
      showIDs={false}
      initialQuery={initialQuery}
      selectedEntityId={selectedEntityId}
      onDone={async result => {
        let property: Property | null = store.getProperty(result.id);
        if (!property) {
          property = await Effect.runPromise(getProperty(result.id));
        }
        onSelectProperty(csvColumnIndex, result.id, property ?? {
          id: result.id,
          name: result.name,
          dataType: 'TEXT',
        });
      }}
      onCreateEntity={result => {
        const propertyId = createProperty({
          name: result.name || '',
          propertyType: result.renderableType || 'TEXT',
        });

        // Resolve the full property from the store after creation
        const property = store.getProperty(propertyId);
        if (property) {
          onCreateProperty?.(csvColumnIndex, propertyId, property);
        } else {
          onCreateProperty?.(csvColumnIndex, propertyId, {
            id: propertyId,
            name: result.name,
            dataType: 'TEXT',
          });
        }
      }}
    />
  );
}

function isImageUrl(value: string): boolean {
  return value.startsWith('ipfs://') || value.startsWith('http://') || value.startsWith('https://');
}

type Props = {
  /** CSV data rows (excluding header). records[row][columnIndex] */
  dataRows: Array<Array<string>>;
  columns: ColumnConfig[];
  /** Optional min height for the scroll container (e.g. 400px) */
  minHeight?: number;
  /** Space ID for property search/creation */
  spaceId: string;
  onSelectProperty?: (csvColumnIndex: number, propertyId: string, property: Property) => void;
  onCreateProperty?: (csvColumnIndex: number, propertyId: string, property: Property) => void;
  unresolvedLinks?: Record<string, UnresolvedImportCell>;
  onResolveRelationToken?: (csvColumnIndex: number, token: string, entity: { id: string; name: string }, isNew?: boolean, relationType?: { id: string; name: string | null }) => void;
  onResolveTypeValue?: (rawType: string, entity: { id: string; name: string }, isNew?: boolean) => void;
  onResolveEntityRow?: (rowIndex: number, entity: { id: string; name: string }) => void;
  /** When true and dataRows exist, show empty state message instead of rows */
  hasUnmappedColumns?: boolean;
};

export function ImportPreviewTable({
  dataRows,
  columns,
  minHeight = 400,
  spaceId,
  onSelectProperty,
  onCreateProperty,
  unresolvedLinks = {},
  onResolveRelationToken,
  onResolveTypeValue,
  onResolveEntityRow,
  hasUnmappedColumns = false,
}: Props) {
  const tableRef = React.useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = React.useState<Record<number, number>>({});

  const columnLayout = React.useMemo(() => {
    const widths = columns.map(col => columnWidths[col.csvColumnIndex] ?? DEFAULT_COLUMN_WIDTH);
    const template = widths.map(w => `${w}px`).join(' ');
    const totalWidth = widths.reduce((sum, w) => sum + w, 0);
    return { template, totalWidth };
  }, [columns, columnWidths]);

  const handleColumnWidthChange = React.useCallback((csvColumnIndex: number, width: number) => {
    setColumnWidths(prev => ({ ...prev, [csvColumnIndex]: width }));
  }, []);

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

  const showEmptyState = hasUnmappedColumns && dataRows.length > 0;

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
                onSelectProperty && !col.mappingLocked ? (
                  <PropertyMappingPopover
                    spaceId={spaceId}
                    csvColumnIndex={col.csvColumnIndex}
                    onSelectProperty={onSelectProperty}
                    onCreateProperty={onCreateProperty}
                    initialQuery={col.headerLabel}
                    selectedEntityId={col.propertyId ?? undefined}
                    trigger={
                      <span className="flex items-center gap-1.5">
                        <PropertySpaceIcon propertyId={col.propertyId} />
                        <Text variant="metadata" className="truncate text-purple">
                          {col.propertyName}
                        </Text>
                      </span>
                    }
                  />
                ) : (
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <PropertySpaceIcon propertyId={col.propertyId} />
                    <Text variant="metadata" className="truncate text-purple">
                      {col.propertyName}
                    </Text>
                  </span>
                )
              ) : onSelectProperty ? (
                <PropertyMappingPopover
                  spaceId={spaceId}
                  csvColumnIndex={col.csvColumnIndex}
                  onSelectProperty={onSelectProperty}
                  onCreateProperty={onCreateProperty}
                  initialQuery={col.headerLabel}
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
              <ResizeHandle
                startWidth={columnWidths[col.csvColumnIndex] ?? DEFAULT_COLUMN_WIDTH}
                onWidthChange={width => handleColumnWidthChange(col.csvColumnIndex, width)}
              />
            </div>
          ))}
        </div>
      </div>

      {showEmptyState ? (
        <div className="flex items-center justify-center py-20" style={{ minWidth: columnLayout.totalWidth }}>
          <Text variant="metadata" className="text-grey-04">
            Your data will appear once you have mapped all of your column properties
          </Text>
        </div>
      ) : (
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
                    const isRelation = col.dataType === 'RELATION';
                    const isImageColumn = col.renderableTypeStrict === 'IMAGE';
                    const cellFlag = unresolvedLinks[`${virtualRow.index}:${col.csvColumnIndex}`];
                    const unresolvedSet =
                      cellFlag?.kind === 'relation' ? new Set(cellFlag.unresolvedValues) : null;
                    const rankedSet =
                      cellFlag?.kind === 'ranked-relation' ? new Set(cellFlag.rankedValues) : null;

                    return (
                      <div
                        key={`${virtualRow.index}-${col.csvColumnIndex}`}
                        className="border-r border-grey-02 px-4 py-2"
                      >
                        {isRelation && value ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {splitRelationCell(value).map((part, i) => {
                              if (
                                unresolvedSet?.has(part) &&
                                onResolveRelationToken
                              ) {
                                return (
                                  <SelectEntityAsPopover
                                    key={i}
                                    trigger={
                                      <button
                                        type="button"
                                        className="inline-flex cursor-pointer items-center gap-1 rounded border border-grey-02 bg-white px-1.5 py-0.5 text-metadata text-text hover:bg-grey-01"
                                      >
                                        <WarningIcon />
                                        <span>{part}</span>
                                        <ChipSeparator />
                                      </button>
                                    }
                                    spaceId={spaceId}
                                    relationValueTypes={col.relationValueTypes}
                                    placeholder="Find or create entity..."
                                    advanced={false}
                                    showIDs={false}
                                    initialQuery={part}
                                    onCreateEntity={() => undefined}
                                    onDone={(result, fromCreateFn) =>
                                      onResolveRelationToken(col.csvColumnIndex, part, {
                                        id: result.id,
                                        name: result.name ?? part,
                                      }, fromCreateFn, col.relationValueTypes?.[0])
                                    }
                                  />
                                );
                              }

                              if (rankedSet?.has(part) && onResolveRelationToken) {
                                return (
                                  <SelectEntityAsPopover
                                    key={i}
                                    trigger={
                                      <button
                                        type="button"
                                        className="inline-flex cursor-pointer items-center gap-1 rounded border border-grey-02 bg-white px-1.5 py-0.5 text-metadata text-text hover:bg-grey-01"
                                      >
                                        <RankedIcon />
                                        <span>{part}</span>
                                        <ChipSeparator />
                                      </button>
                                    }
                                    spaceId={spaceId}
                                    relationValueTypes={col.relationValueTypes}
                                    placeholder="Find or create entity..."
                                    advanced={false}
                                    showIDs={false}
                                    initialQuery={part}
                                    onCreateEntity={() => undefined}
                                    onDone={(result, fromCreateFn) =>
                                      onResolveRelationToken(col.csvColumnIndex, part, {
                                        id: result.id,
                                        name: result.name ?? part,
                                      }, fromCreateFn, col.relationValueTypes?.[0])
                                    }
                                  />
                                );
                              }

                              if (onResolveRelationToken) {
                                return (
                                  <SelectEntityAsPopover
                                    key={i}
                                    trigger={
                                      <button
                                        type="button"
                                        className="inline-flex cursor-pointer items-center gap-1 rounded border border-grey-02 bg-white px-1.5 py-0.5 text-metadata text-text hover:bg-grey-01"
                                      >
                                        <span>{part}</span>
                                        <ChipSeparator />
                                      </button>
                                    }
                                    spaceId={spaceId}
                                    relationValueTypes={col.relationValueTypes}
                                    placeholder="Find or create entity..."
                                    advanced={false}
                                    showIDs={false}
                                    initialQuery={part}
                                    onCreateEntity={() => undefined}
                                    onDone={(result, fromCreateFn) =>
                                      onResolveRelationToken(col.csvColumnIndex, part, {
                                        id: result.id,
                                        name: result.name ?? part,
                                      }, fromCreateFn, col.relationValueTypes?.[0])
                                    }
                                  />
                                );
                              }

                              return (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 rounded border border-grey-02 bg-white px-1.5 py-0.5 text-metadata text-text"
                                >
                                  <span>{part}</span>
                                  <ChipSeparator />
                                </span>
                              );
                            })}
                          </div>
                        ) : isImageColumn && value && isImageUrl(value) ? (
                          <div className="overflow-hidden rounded" style={{ width: 60 }}>
                            <NativeGeoImage
                              value={value}
                              alt=""
                              className="h-auto w-[60px] object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex w-full items-start gap-2">
                            {cellFlag?.kind === 'type' && onResolveTypeValue ? (
                              <>
                                <SelectEntityAsPopover
                                  trigger={
                                    <button
                                      type="button"
                                      className="inline-flex cursor-pointer items-center gap-1 rounded border border-grey-02 bg-white px-1.5 py-0.5 text-metadata text-text hover:bg-grey-01"
                                    >
                                      <WarningIcon />
                                      <span>{value || cellFlag.rawType}</span>
                                      <ChipSeparator />
                                    </button>
                                  }
                                  spaceId={spaceId}
                                  placeholder="Find or create type..."
                                  advanced={false}
                                  showIDs={false}
                                  initialQuery={value || cellFlag.rawType}
                                  onCreateEntity={() => undefined}
                                  onDone={(result, fromCreateFn) =>
                                    onResolveTypeValue(cellFlag.rawType, {
                                      id: result.id,
                                      name: result.name ?? cellFlag.rawType,
                                    }, fromCreateFn)
                                  }
                                />
                              </>
                            ) : cellFlag?.kind === 'entity' && onResolveEntityRow ? (
                              <SelectEntityAsPopover
                                trigger={
                                  <button
                                    type="button"
                                    className="inline-flex cursor-pointer items-center gap-1.5 text-tableCell text-text hover:underline"
                                  >
                                    <StatusDot color="red" />
                                    <span>{value || '—'}</span>
                                  </button>
                                }
                                spaceId={spaceId}
                                placeholder="Find or create entity..."
                                advanced={false}
                                showIDs={false}
                                initialQuery={value}
                                onCreateEntity={() => undefined}
                                onDone={result =>
                                  onResolveEntityRow(virtualRow.index, {
                                    id: result.id,
                                    name: result.name ?? value,
                                  })
                                }
                              />
                            ) : cellFlag?.kind === 'ranked-entity' && onResolveEntityRow ? (
                              <SelectEntityAsPopover
                                trigger={
                                  <button
                                    type="button"
                                    className="inline-flex cursor-pointer items-center gap-1.5 text-tableCell text-text hover:underline"
                                  >
                                    <StatusDot color="orange" />
                                    <span>{value || '—'}</span>
                                  </button>
                                }
                                spaceId={spaceId}
                                placeholder="Find or create entity..."
                                advanced={false}
                                showIDs={false}
                                initialQuery={value}
                                onCreateEntity={() => undefined}
                                onDone={result =>
                                  onResolveEntityRow(virtualRow.index, {
                                    id: result.id,
                                    name: result.name ?? value,
                                  })
                                }
                              />
                            ) : col.propertyId === SystemIds.NAME_PROPERTY && onResolveEntityRow ? (
                              <SelectEntityAsPopover
                                trigger={
                                  <button
                                    type="button"
                                    className="inline-flex cursor-pointer items-center gap-1.5 text-tableCell text-text hover:underline"
                                  >
                                    <span>{value || '—'}</span>
                                  </button>
                                }
                                spaceId={spaceId}
                                placeholder="Find or create entity..."
                                advanced={false}
                                showIDs={false}
                                initialQuery={value}
                                onCreateEntity={() => undefined}
                                onDone={result =>
                                  onResolveEntityRow(virtualRow.index, {
                                    id: result.id,
                                    name: result.name ?? value,
                                  })
                                }
                              />
                            ) : (
                              <Text variant="tableCell" className="wrap-break-word">
                                {value || '—'}
                              </Text>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
