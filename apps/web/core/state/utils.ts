import { createSelector } from '@reduxjs/toolkit';

import { RootState } from './root-store';

const selectVisibleTriples = (state: RootState) => state.changes.triples.filter(t => !t.hasBeenDeleted);

export const visibleTriplesSelector = createSelector([selectVisibleTriples], triples => triples);
