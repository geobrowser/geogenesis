import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

const initialState = false;

export const editableSlice = createSlice({
  name: 'is-editing',
  initialState,
  reducers: {
    setEditable: (state, action: PayloadAction<boolean>) => {
      state = action.payload;
      return state;
    },
  },
});

// Action creators are generated for each case reducer function
export const { setEditable } = editableSlice.actions;
