import { createSelector } from '@reduxjs/toolkit';

import { RootState } from './root-store';

const selectVisibleTriples = (state: RootState) => state.changes.triples.filter(t => !t.hasBeenDeleted);

export const visibleTriplesSelector = createSelector([selectVisibleTriples], triples => triples);

const selectEntityTriples = (state: RootState, entityId: string) =>
  state.changes.triples.filter(t => t.entityId === entityId);

export const entityTriplesSelector = createSelector([selectEntityTriples], triples => triples);

const selectSpaceTriples = (state: RootState, spaceId: string) =>
  state.changes.triples.filter(t => t.space === spaceId);

export const spaceTriplesSelector = createSelector([selectSpaceTriples], triples => triples);
