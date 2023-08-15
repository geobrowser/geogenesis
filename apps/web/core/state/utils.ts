import { createSelector } from '@reduxjs/toolkit';

import { RootState } from './root-store';

const selectVisibleTriples = (state: RootState) => state.changes.triples.filter(t => !t.hasBeenDeleted);

export const visibleTriplesSelector = createSelector([selectVisibleTriples], triples => triples);

const selectEntityTriples = (state: RootState, id: string) => state.changes.triples.filter(t => t.entityId === id);

export const entityTriplesSelector = createSelector([selectEntityTriples], triples => triples);
