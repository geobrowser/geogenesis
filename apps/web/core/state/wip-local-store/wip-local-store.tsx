import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';

import { triplesSlice, upsert } from './wip-local-store-slice';

const listenerMiddleware = createListenerMiddleware();

listenerMiddleware.startListening({
  actionCreator: upsert,
  effect: action => {
    console.log('triple added', action.payload.newTriple);
  },
});

export const store = configureStore({
  reducer: {
    changes: triplesSlice.reducer,
  },
  // Add the listener middleware to the store.
  // NOTE: Since this can receive actions with functions inside,
  // it should go before the serializability check middleware
  middleware: getDefaultMiddleware => getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
