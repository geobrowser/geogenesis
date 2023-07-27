import { FilterState } from '~/core/types';

export type InitialEntityTableStoreParams = {
  query: string;
  pageNumber: number;
  filterState: FilterState;
  typeId: string | null;
};
