'use client';

import { useMemo } from 'react';

import { useAtomValue } from 'jotai';

import { useSyncEngine } from '~/core/sync/use-sync-engine';

import { Text } from '~/design-system/text';

import { columnMappingAtom, extraPropertiesAtom, selectedTypeAtom, typesColumnIndexAtom } from './atoms';
import { useImportData } from './use-import-data';
import { useImportSchema } from './use-import-schema';

const PREVIEW_ROW_COUNT = 5;
const COLUMN_WIDTH = 200;

type ImportDataPreviewProps = {
  spaceId: string;
};

export const ImportDataPreview = ({ spaceId }: ImportDataPreviewProps) => {
  const { headers, rows } = useImportData();
  const selectedType = useAtomValue(selectedTypeAtom);
  const typesColumnIndex = useAtomValue(typesColumnIndexAtom);
  const columnMapping = useAtomValue(columnMappingAtom);
  const extraProperties = useAtomValue(extraPropertiesAtom);
  const { schema } = useImportSchema({ selectedTypeId: selectedType?.id, spaceId });
  const { store } = useSyncEngine();

  const columnLabels = useMemo(() => {
    const propIdToName = new Map(schema.map(p => [p.id, p.name ?? p.id]));
    return headers.map((headerLabel, csvColumnIndex) => {
      const isTypesSourceColumn = typesColumnIndex !== undefined && csvColumnIndex === typesColumnIndex;
      const propertyId = columnMapping[csvColumnIndex];
      const propertyName = isTypesSourceColumn
        ? 'Types (from CSV)'
        : propertyId
          ? (propIdToName.get(propertyId) ??
            extraProperties[propertyId]?.name ??
            store.getProperty(propertyId)?.name ??
            propertyId)
          : null;
      return {
        csvColumnIndex,
        headerLabel: headerLabel?.trim() || `Column ${csvColumnIndex + 1}`,
        propertyName,
      };
    });
  }, [headers, columnMapping, schema, extraProperties, store, typesColumnIndex]);

  const previewRows = useMemo(() => rows.slice(0, PREVIEW_ROW_COUNT), [rows]);

  if (headers.length === 0 || previewRows.length === 0) return null;

  return (
    <div className="mb-3 overflow-x-auto rounded-lg border border-grey-02 bg-white">
      <table className="w-full border-collapse" style={{ minWidth: headers.length * COLUMN_WIDTH }}>
        <thead>
          <tr className="border-b border-grey-02 bg-grey-01">
            {columnLabels.map(col => (
              <th
                key={col.csvColumnIndex}
                className="border-r border-grey-02 px-4 py-2 text-left align-top last:border-r-0"
                style={{ width: COLUMN_WIDTH, minWidth: COLUMN_WIDTH }}
              >
                <div className="flex flex-col gap-0.5">
                  <Text variant="metadata" className="truncate text-grey-04">
                    {col.headerLabel}
                  </Text>
                  {col.propertyName ? (
                    <Text variant="smallButton" className="truncate text-text">
                      {col.propertyName}
                    </Text>
                  ) : (
                    <Text variant="smallButton" className="truncate text-grey-04 italic">
                      Needs mapping
                    </Text>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-grey-02 last:border-b-0">
              {columnLabels.map(col => (
                <td
                  key={col.csvColumnIndex}
                  className="border-r border-grey-02 px-4 py-2 align-top last:border-r-0"
                  style={{ width: COLUMN_WIDTH, minWidth: COLUMN_WIDTH, maxWidth: COLUMN_WIDTH }}
                >
                  <Text variant="metadata" className="truncate text-text">
                    {row[col.csvColumnIndex] ?? ''}
                  </Text>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
