import * as React from 'react';

import { ReviewState } from '~/core/types';

interface StatusBarState {
  reviewState: ReviewState;
  error: string | null;
}

type StatusBarActions =
  | {
      type: 'SET_REVIEW_STATE';
      payload: ReviewState;
    }
  | { type: 'ERROR'; payload: string | null };

const statusBarReducer = (state: StatusBarState, action: StatusBarActions): StatusBarState => {
  switch (action.type) {
    case 'SET_REVIEW_STATE':
      return { reviewState: action.payload, error: null };
    case 'ERROR':
      return { reviewState: 'publish-error', error: action.payload };
  }
};

const StatusBarContext = React.createContext<{
  state: StatusBarState;
  dispatch: React.Dispatch<StatusBarActions>;
} | null>(null);

export const StatusBarContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = React.useReducer(statusBarReducer, {
    reviewState: 'idle',
    error: null,
  });

  return <StatusBarContext.Provider value={{ state, dispatch }}>{children}</StatusBarContext.Provider>;
};

export function useStatusBar() {
  const context = React.useContext(StatusBarContext);

  if (!context) {
    throw new Error('useStatusBar must be used within a StatusBarContextProvider');
  }

  return context;
}
