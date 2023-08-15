import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';

import { EditableStoreActions } from './editable-store';
import { triplesStoreSlice } from './triple-store/triple-store-slice';
import { WipLocalStoreActions } from './wip-local-store';

const listenerMiddleware = createListenerMiddleware();

listenerMiddleware.startListening({
  actionCreator: WipLocalStoreActions.upsert,
  effect: action => {
    console.log('triple added', action.payload.newTriple);
  },
});

export const store = configureStore({
  reducer: {
    changes: WipLocalStoreActions.triplesSlice.reducer,
    isEditing: EditableStoreActions.editableSlice.reducer,
    triplesStore: triplesStoreSlice.reducer,
  },
  devTools: process.env.NODE_ENV === 'development',
  // Add the listener middleware to the store.
  // NOTE: Since this can receive actions with functions inside,
  // it should go before the serializability check middleware
  middleware: getDefaultMiddleware => getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
