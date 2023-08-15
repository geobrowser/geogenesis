'use client';

import { useGeoDispatch } from '~/core/hooks/use-dispatch';
import { useGeoSelector } from '~/core/hooks/use-selector';
import { visibleTriplesSelector } from '~/core/state/utils';
import { WipLocalStoreActions } from '~/core/state/wip-local-store';
import { Triple } from '~/core/utils/triple';

export default function LocalPage() {
  const triples = useGeoSelector(state => visibleTriplesSelector(state));
  const dispatch = useGeoDispatch();

  return (
    <div className="flex flex-col gap-2">
      {triples.map(t => (
        <button onClick={() => dispatch(WipLocalStoreActions.remove(t))} key={t.id}>
          {t.id}
        </button>
      ))}

      <button
        onClick={() =>
          dispatch(
            WipLocalStoreActions.upsert({
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
