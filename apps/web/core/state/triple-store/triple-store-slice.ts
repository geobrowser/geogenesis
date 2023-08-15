import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

import { FilterState } from '~/core/types';

export interface TripleStoreState {
  query: string;
  filterState: FilterState;
  pageNumber: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  hydrated: boolean;
}

export const initialState: TripleStoreState = {
  query: '',
  filterState: [],
  pageNumber: 0,
  hasPreviousPage: false,
  hasNextPage: false,
  hydrated: false,
};

export const triplesStoreSlice = createSlice({
  name: 'triples-store',
  initialState,
  reducers: {
    setQuery: (state, action: PayloadAction<string>) => {
      state.query = action.payload;
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.pageNumber = action.payload;

      if (action.payload === 0) {
        state.hasPreviousPage = false;
      }

      if (action.payload > 0) {
        state.hasPreviousPage = true;
      }

      return state;
    },
    setFilterState: (state, action: PayloadAction<FilterState>) => {
      const newState = action.payload.length === 0 ? initialFilterState() : action.payload;
      state.pageNumber = 0;
      state.filterState = newState;

      return state;
    },
  },
});

// Action creators are generated for each case reducer function
export const { setQuery, setFilterState, setPage } = triplesStoreSlice.actions;

export function initialFilterState(): FilterState {
  return [];
}
