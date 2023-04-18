import { SYSTEM_IDS } from '@geogenesis/ids';
import { diffWords } from 'diff';
import type { Change as Difference } from 'diff';

import { Action } from '../action';
import type { Action as ActionType } from '~/modules/types';
import type { INetwork } from '~/modules/io/data-source/network';
import type { TripleValueType } from '~/modules/types';

export type Changes = Record<EntityId, Changeset>;

type EntityId = string;

type Changeset = {
  entityName: string;
  blocks?: Record<BlockId, BlockChange>;
  [key: string]: TripleChange;
};

type BlockId = string;

type BlockChange = {
  type: 'textBlock' | 'imageBlock' | 'markdownContent';
  before: string;
  after: string;
  source: 'create' | 'edit' | 'delete';
  actions: Array<string>;
};

type TripleId = string;

type TripleChange = {
  type: TripleValueType;
  before: string;
  after: string;
  source: 'create' | 'edit' | 'delete';
  actions: Array<string>;
};

export function fromActions(actions: ActionType[]) {
  const changes: Changes = {};

  // @TODO remove console.info
  console.clear();
  console.info('ACTIONS:', JSON.stringify(actions, null, 2));

  // @TODO remove notes
  // isName: value === SYSTEM_IDS.NAME;
  // isRelation: value === SYSTEM_IDS.RELATION;
  // isText: value === SYSTEM_IDS.TEXT;
  // isImage: value === SYSTEM_IDS.IMAGE;

  for (const action of actions) {
    switch (action.type) {
      case 'createTriple':
        break;
      case 'editTriple':
        switch (action.before.attributeId) {
          case SYSTEM_IDS.NAME:
            changes[action.before.entityId] = {
              ...changes[action.before.entityId],
              before: changes[action.before.entityId]?.before ?? Action.getValue(action.before, ''),
              after:
                changes[action.before.entityId]?.[action.before.attributeId]?.after ??
                Action.getValue(action.before, ''),
              source: changes[action.before.entityId]?.source ?? 'edit',
            };
            break;
        }
        break;
      case 'deleteTriple':
        break;
    }
  }

  // @TODO remove console.info
  console.info('CHANGES:', JSON.stringify(changes, null, 2));

  return changes;
}
