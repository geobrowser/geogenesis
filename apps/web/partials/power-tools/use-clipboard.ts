import * as React from 'react';
import { Row, Cell, Property } from '~/core/v2.types';
import { SystemIds } from '@graphprotocol/grc-20';

// UUID regex pattern - matches standard UUID format
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUUID(str: string): boolean {
  return UUID_PATTERN.test(str.trim());
}

function parseRelationUUIDs(cellValue: string): string[] {
  if (!cellValue.trim()) return [];

  // Split by comma and check each part
  const parts = cellValue.split(',').map(part => part.trim()).filter(part => part);
  const uuids = parts.filter(isUUID);

  // Only return UUIDs if all parts are valid UUIDs (to avoid false positives)
  return uuids.length === parts.length ? uuids : [];
}

export interface ClipboardData {
  headers: string[];
  rows: string[][];
}

// Legacy interfaces - keeping for compatibility but no longer used
export interface RichClipboardData {
  headers: string[];
  rows: RichClipboardRow[];
}

export interface RichClipboardRow {
  cells: RichClipboardCell[];
}

export interface RichClipboardCell {
  type: 'value' | 'relation' | 'relations' | 'name';
  textValue: string;
  relationId?: string;
  relationName?: string;
  relations?: Array<{
    id: string;
    name?: string;
  }>;
}

export function useClipboard() {
  const copyRowsToClipboard = React.useCallback(async (
    rows: Row[],
    properties: Property[]
  ): Promise<boolean> => {
    try {
      // Create headers
      const headers = properties.map(prop =>
        prop.id === SystemIds.NAME_PROPERTY ? 'Name' : (prop.name || prop.id)
      );

      // Convert rows to TSV format with embedded relation UUIDs
      const rowData = rows.map(row =>
        properties.map(prop => {
          const cell = row.columns[prop.id];
          return formatCellForClipboard(cell);
        })
      );

      // Create TSV format (Tab-separated values for Excel compatibility)
      const tsvContent = [
        headers.join('\t'),
        ...rowData.map(row => row.join('\t'))
      ].join('\n');

      // Copy TSV to system clipboard - this is our single source of truth
      await navigator.clipboard.writeText(tsvContent);
      return true;
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  }, []);

  const pasteRowsFromClipboard = React.useCallback(async (): Promise<ClipboardData | null> => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return null;

      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length === 0) return null;

      // First line is headers
      const headers = lines[0].split('\t');

      // Remaining lines are data rows
      const rows = lines.slice(1).map(line => line.split('\t'));

      return { headers, rows };
    } catch (error) {
      console.error('Failed to read from clipboard:', error);
      return null;
    }
  }, []);

  const isClipboardSupported = React.useMemo(() => {
    return typeof navigator !== 'undefined' &&
           'clipboard' in navigator &&
           'writeText' in navigator.clipboard &&
           'readText' in navigator.clipboard;
  }, []);

  return {
    copyRowsToClipboard,
    pasteRowsFromClipboard,
    isClipboardSupported,
    parseRelationUUIDs,
  };
}

// Legacy function - no longer used but keeping for compatibility

function formatCellForClipboard(cell: Cell | undefined): string {
  if (!cell) return '';

  // Handle name cells
  if (cell.name) {
    return cell.name;
  }

  // Handle value cells
  if ((cell as any).value !== undefined && (cell as any).value !== null) {
    return String((cell as any).value);
  }

  // Handle multiple relations - encode as comma-separated UUIDs
  if ((cell as any).relations && Array.isArray((cell as any).relations)) {
    const relations = (cell as any).relations;
    return relations.map((r: any) => r.id).join(', ');
  }

  // Handle single relation - use UUID
  if ((cell as any).relation) {
    const relation = (cell as any).relation;
    return relation.id;
  }

  return '';
}