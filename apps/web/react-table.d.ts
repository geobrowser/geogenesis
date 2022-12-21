import '@tanstack/react-table';

// We declare a new function that we will define and pass into the useTable hook.
// See: https://tanstack.com/table/v8/docs/examples/react/editable-data
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface TableMeta<TData extends RowData> {
    space: string;
    expandedCells: Record<string, boolean>;
  }
}
