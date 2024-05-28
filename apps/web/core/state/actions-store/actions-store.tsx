import { atom, useAtom } from 'jotai';

import * as React from 'react';

import { getAppTripleId } from '~/core/id/create-id';
import {
  DeleteTripleAppOp,
  EntityActions,
  Triple as ITriple,
  OmitStrict,
  SetTripleAppOp,
  SpaceTriples,
} from '~/core/types';
import { Triple } from '~/core/utils/triple';

import { store } from '../jotai-store';
import { db } from './indexeddb';

const atomWithAsyncStorage = (initialValue: ITriple[] = []) => {
  const baseAtom = atom<ITriple[]>(initialValue);

  // baseAtom.onMount = setValue => {
  //   (async () => {
  //     const storedActions = await db.triples.toArray();

  //     setValue(storedActions);
  //   })();
  // };

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

const upsert = (op: StoreOp, spaceId: string) => {
  const triple: ITriple = {
    id: getAppTripleId(op, spaceId),
    entityId: op.entityId,
    attributeId: op.attributeId,
    // How do we make this work well with local image triples? We want
    // to store just the image itself to make rendering images easy,
    // but that's not actually how we publish the images. Maybe we
    // need to update it on Triple.prepareForPublishing...?
    value:
      op.type === 'SET_TRIPLE'
        ? op.value
        : // We don't set value as null so just use placeholder value
          {
            type: 'TEXT',
            value: '',
          },

    entityName: op.type === 'SET_TRIPLE' ? op.entityName : null,
    attributeName: op.type === 'SET_TRIPLE' ? op.attributeName : null,
    space: spaceId,
    hasBeenPublished: false,
    isDeleted: false,
    timestamp: Triple.timestamp(),
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

function getSpaceTriples(triples: ITriple[]) {
  const triplesBySpace: SpaceTriples = {};

  for (const triple of triples) {
    const spaceId = triple.space;
    if (!spaceId) continue;

    if (!triplesBySpace[spaceId]) {
      triplesBySpace[spaceId] = [];
    }

    triplesBySpace[spaceId] = [...triplesBySpace[spaceId], triple];
  }

  return triplesBySpace;
}

export function useActions(spaceId?: string) {
  const [allActions, setActions] = useAtom(localTriplesAtom);

  const actions = React.useMemo(() => {
    return getSpaceTriples(allActions);
  }, [allActions]);

  const actionsByEntityId = React.useMemo(() => {
    return allActions.reduce<EntityActions>((acc, action) => {
      const tripleFromAction = Triple.merge([action], [])[0];

      if (!tripleFromAction) return acc;

      acc[action.entityId] = {
        ...acc[action.entityId],
        [action.attributeId]: tripleFromAction,
      };

      return acc;
    }, {});
  }, [allActions]);

  const allSpacesWithActions = React.useMemo(() => {
    // Only return spaces where at least one action has not been published
    return Object.keys(actions).filter(spaceId => actions[spaceId].every(triple => triple?.hasBeenPublished !== true));
  }, [actions]);

  if (!spaceId) {
    return {
      allActions,
      allSpacesWithActions,
      actionsFromSpace: [],
      actionsByEntityId,
      actions,

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
    allActions,
    allSpacesWithActions,
    actionsFromSpace: actions[spaceId] ?? [],
    actionsByEntityId,
    actions,

    addActions: setActions,
    upsert,
    remove,
    clear,

    deleteActionsFromSpace,
    addActionsToSpaces,
    restore,
  };
}
