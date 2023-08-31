import * as React from 'react';

import { ReviewState } from '~/core/types';

export interface MoveTriplesState {
  reviewState: ReviewState;
  error: string | null;
}

export type ReviewActions =
  | {
      type: 'SET_REVIEW_STATE';
      payload: ReviewState;
    }
  | { type: 'ERROR'; payload: string | null };

const moveTriplesReducer = (state: MoveTriplesState, action: ReviewActions): MoveTriplesState => {
  switch (action.type) {
    case 'SET_REVIEW_STATE':
      return { ...state, reviewState: action.payload, error: null };
    case 'ERROR':
      return { ...state, reviewState: 'publish-error', error: action.payload };
    default:
      return state;
  }
};

// Custom hook for review state management
export function useMoveTriplesState(initialState: ReviewState = 'idle') {
  const [state, dispatch] = React.useReducer(moveTriplesReducer, {
    reviewState: initialState,
    error: null,
  });

  return { state, dispatch };
}
