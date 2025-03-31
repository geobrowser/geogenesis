import '@tanstack/react-table';

import { Source } from './core/blocks/data/source';
import { PropertyId } from './core/hooks/use-properties';
import { PropertySchema } from './core/types';
import { onChangeEntryFn } from './partials/blocks/table/change-entry';

// We declare a new function that we will define and pass into the useTable hook.
// See: https://tanstack.com/table/v8/docs/examples/react/editable-data
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface TableMeta<TData extends RowData> {
    space: string;
    expandedCells: Record<string, boolean>;
    isEditable: boolean;
    onChangeEntry: onChangeEntryFn;
    propertiesSchema: Record<PropertyId, PropertySchema> | undefined;
    source: Source;
  }
}
