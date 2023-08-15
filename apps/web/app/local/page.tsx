'use client';

import { createSelector } from '@reduxjs/toolkit';

import { useGeoDispatch } from '~/core/hooks/use-dispatch';
import { useGeoSelector } from '~/core/hooks/use-selector';
import { RootState } from '~/core/state/wip-local-store/wip-local-store';
import { remove, upsert } from '~/core/state/wip-local-store/wip-local-store-slice';
import { Triple } from '~/core/utils/triple';

const selectVisibleTriples = (state: RootState) => state.changes.triples.filter(t => !t.hasBeenDeleted);

const visibleTriplesSelector = createSelector([selectVisibleTriples], triples => triples);

export default function LocalPage() {
  const triples = useGeoSelector(state => visibleTriplesSelector(state));
  const dispatch = useGeoDispatch();

  return (
    <div className="flex flex-col gap-2">
      {triples.map(t => (
        <button onClick={() => dispatch(remove(t))} key={t.id}>
          {t.id}
        </button>
      ))}

      <button
        onClick={() =>
          dispatch(
            upsert({
              newTriple: Triple.withId({
                attributeId: 'name',
                attributeName: 'Name',
                entityName: 'Banana',
                entityId: '3249578',
                space: 'test',
                value: {
                  id: '55',
                  type: 'string',
                  value: 'Banana',
                },
              }),
            })
          )
        }
      >
        Create
      </button>
    </div>
  );
}
