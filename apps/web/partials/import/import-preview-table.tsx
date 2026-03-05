'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Effect } from 'effect';

import * as React from 'react';

import { useCreateProperty } from '~/core/hooks/use-create-property';
import { getProperty } from '~/core/io/queries';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { Property } from '~/core/types';

import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import { Text } from '~/design-system/text';

import type { UnresolvedImportCell } from './atoms';
import { splitRelationCell } from './relation-cell';

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
  /** Data type of the mapped property, used to render relation cells as chips */
  dataType?: string;
  /** Mapped property id for this CSV column (null when unmapped) */
  propertyId?: string | null;
  /** Allowed relation target types for this relation property */
  relationValueTypes?: Property['relationValueTypes'];
};

function PropertyMappingPopover({
  spaceId,
  csvColumnIndex,
  onSelectProperty,
  onCreateProperty,
  trigger,
}: {
  spaceId: string;
  csvColumnIndex: number;
  onSelectProperty: (csvColumnIndex: number, propertyId: string, property: Property) => void;
  onCreateProperty?: (csvColumnIndex: number, propertyId: string, property: Property) => void;
  trigger: React.ReactNode;
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
  onResolveRelationToken?: (csvColumnIndex: number, token: string, entity: { id: string; name: string }) => void;
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
                onSelectProperty ? (
                  <PropertyMappingPopover
                    spaceId={spaceId}
                    csvColumnIndex={col.csvColumnIndex}
                    onSelectProperty={onSelectProperty}
                    onCreateProperty={onCreateProperty}
                    trigger={
                      <span className="flex items-center gap-1.5">
                        <span className="inline-flex h-4 w-4 shrink-0 rounded-full bg-purple/20" aria-hidden />
                        <Text variant="metadata" className="truncate text-purple">
                          {col.propertyName}
                        </Text>
                      </span>
                    }
                  />
                ) : (
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="inline-flex h-4 w-4 shrink-0 rounded-full bg-purple/20" aria-hidden />
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
                  const isRelation = col.dataType === 'RELATION';
                  const unresolved = unresolvedLinks[`${virtualRow.index}:${col.csvColumnIndex}`];
                  const unresolvedSet =
                    unresolved?.kind === 'relation' ? new Set(unresolved.unresolvedValues) : null;

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
                                      className="inline-flex cursor-pointer items-center rounded border border-red-01 bg-red-01/5 px-1.5 py-0.5 text-metadata text-red-01 hover:bg-red-01/10"
                                    >
                                      {part}
                                    </button>
                                  }
                                  spaceId={spaceId}
                                  relationValueTypes={col.relationValueTypes}
                                  placeholder="Find or create entity..."
                                  advanced={false}
                                  showIDs={false}
                                  onCreateEntity={() => undefined}
                                  onDone={result =>
                                    onResolveRelationToken(col.csvColumnIndex, part, {
                                      id: result.id,
                                      name: result.name ?? part,
                                    })
                                  }
                                />
                              );
                            }

                            return (
                              <span
                                key={i}
                                className={
                                  unresolvedSet?.has(part)
                                    ? 'inline-flex items-center rounded border border-red-01 bg-red-01/5 px-1.5 py-0.5 text-metadata text-red-01'
                                    : 'inline-flex items-center rounded border border-grey-02 px-1.5 py-0.5 text-metadata text-text'
                                }
                              >
                                {part}
                              </span>
                            );
                          })}
                          {unresolved?.kind === 'relation' ? (
                            <span className="inline-flex items-center rounded bg-red-01/10 px-1.5 py-0.5 text-metadata text-red-01">
                              Unresolved link
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex w-full items-start gap-2 overflow-hidden">
                          <Text variant="metadata" className="min-w-0 truncate text-text">
                            {value || '—'}
                          </Text>
                          {unresolved?.kind === 'entity' ? (
                            <span className="inline-flex shrink-0 items-center rounded bg-red-01/10 px-1.5 py-0.5 text-metadata text-red-01">
                              Unresolved entity
                            </span>
                          ) : null}
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
    </div>
  );
}
