import * as React from 'react';

import { ReviewState } from '~/core/types';

export interface MoveReviewState {
  reviewState: ReviewState;
  error: string | null;
}

export type ReviewActions =
  | {
      type: 'SET_REVIEW_STATE';
      payload: ReviewState;
    }
  | { type: 'ERROR'; payload: string | null };

const statusBarReducer = (state: MoveReviewState, action: ReviewActions): MoveReviewState => {
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
export function useReviewState(initialState: ReviewState = 'idle') {
  const [state, dispatch] = React.useReducer(statusBarReducer, {
    reviewState: initialState,
    error: null,
  });

  return { state, dispatch };
}
