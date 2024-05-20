import { atom, useAtom } from 'jotai';

import { AppOp, AppTriple, DeleteTripleAppOp, OmitStrict, SetTripleAppOp, SpaceTriples } from '~/core/types';

import { store } from '../jotai-store';
import { db } from './indexeddb';

const atomWithAsyncStorage = (initialValue: AppTriple[] = []) => {
  const baseAtom = atom<AppTriple[]>(initialValue);

  baseAtom.onMount = setValue => {
    (async () => {
      const storedActions = await db.actions.toArray();

      setValue(storedActions);
    })();
  };

  return baseAtom;
};

export const localTriplesAtom = atomWithAsyncStorage();

const remove = (op: OmitStrict<StoreOp, 'type'>, spaceId: string) => {
  // We don't delete from our local store, but instead just set a tombstone
  // on the row. This is so we can still publish the changes as an op
  upsert(
    {
      ...op,
      type: 'DELETE_TRIPLE',
    },
    spaceId
  );
};

// @TODO: Write about why we have FOUR representations for an op (store op, app op, substream op, ipfs op)
type StoreOp =
  | OmitStrict<SetTripleAppOp, 'id'>
  | OmitStrict<DeleteTripleAppOp, 'id' | 'attributeName' | 'entityName' | 'value'>;

const getAppTripleId = (op: StoreOp, spaceId: string) => `${spaceId}:${op.entityId}:${op.attributeId}`;

const upsert = (op: StoreOp, spaceId: string) => {
  const triple: AppTriple = {
    ...op,
    id: getAppTripleId(op, spaceId),
    attributeName: op.type === 'SET_TRIPLE' ? op.attributeName : null,
    entityName: op.type === 'SET_TRIPLE' ? op.entityName : null,
    value:
      op.type === 'SET_TRIPLE'
        ? op.value
        : // We don't set value as null so just use placeholder value
          {
            type: 'TEXT',
            value: '',
          },
    hasBeenPublished: false,
    space: spaceId,
    isDeleted: false,
    timestamp: new Date().toISOString(),
    placeholder: false,
  };

  const nonMatchingTriples = store.get(localTriplesAtom).filter(t => {
    return t.id !== getAppTripleId(op, spaceId);
  });

  if (op.type === 'DELETE_TRIPLE') {
    triple.isDeleted = true;
  }

  store.set(localTriplesAtom, [...nonMatchingTriples, triple]);
};

const restore = (spaceActions: SpaceTriples) => {
  const newActionsAsArray = Object.values(spaceActions).flatMap(actions => actions);
  store.set(localTriplesAtom, newActionsAsArray);
};

const clear = (spaceId?: string) => {
  if (!spaceId) {
    store.set(localTriplesAtom, []);
    return;
  }

  const allActions = store.get(localTriplesAtom);
  store.set(localTriplesAtom, []);
};

// @TODO: This is the same as restore
const addActionsToSpaces = (spaceActions: SpaceTriples) => {
  const newActionsAsArray = Object.values(spaceActions).flatMap(actions => actions);
  store.set(localTriplesAtom, newActionsAsArray);
};

const deleteActionsFromSpace = (spaceId: string, actionIdsToDelete: Array<string>) => {
  const allActions = store.get(localTriplesAtom);
  store.set(localTriplesAtom, []);
};

export function useActions(spaceId?: string) {
  const [allActions, setActions] = useAtom(localTriplesAtom);

  if (!spaceId) {
    return {
      allActions,
      allSpacesWithActions: [],
      actionsFromSpace: [],
      actionsByEntityId: {},
      actions: {},

      addActions: setActions,
      upsert,
      remove,
      clear,

      deleteActionsFromSpace,
      addActionsToSpaces,
      restore,
    };
  }

  return {
    allActions: [],
    allSpacesWithActions: [],
    actionsFromSpace: [],
    actionsByEntityId: {},
    actions: {},

    addActions: setActions,
    upsert,
    remove,
    clear,

    deleteActionsFromSpace,
    addActionsToSpaces,
    restore,
  };
}
