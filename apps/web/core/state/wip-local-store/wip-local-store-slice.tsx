import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

import { LocalTriple, Triple } from '~/core/types';

export interface TriplesState {
  triples: LocalTriple[];
}

const initialState: TriplesState = {
  triples: [],
};

export const triplesSlice = createSlice({
  name: 'local-triples',
  initialState,
  reducers: {
    upsert: (
      state,
      action: PayloadAction<{
        newTriple: Triple;
        oldTriple?: Triple;
      }>
    ) => {
      const index = state.triples.findIndex(t => t.id === action.payload.newTriple.id);

      if (index === -1) {
        state.triples.push(action.payload.newTriple);
        return;
      }

      if (action.payload.oldTriple) {
        state.triples[index] = action.payload.oldTriple;
      }

      state.triples[index] = {
        ...action.payload.newTriple,
        updatedAt: new Date().toISOString(),
        hasBeenDeleted: false,
      };
    },
    remove: (state, action: PayloadAction<Triple>) => {
      const index = state.triples.findIndex(t => t.id === action.payload.id);

      const newTriple = {
        ...action.payload,
        updatedAt: new Date().toISOString(),
        hasBeenDeleted: true,
      };

      if (index === -1) {
        state.triples.push(newTriple);
        return;
      }

      state.triples[index] = newTriple;
    },
  },
});

// Action creators are generated for each case reducer function
export const { remove, upsert } = triplesSlice.actions;
