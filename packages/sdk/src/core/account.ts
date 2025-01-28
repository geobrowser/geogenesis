import { make as makeId } from '../id.js';
import { Relation } from '../relation.js';
import type { CreateRelationOp, SetTripleOp } from '../types.js';
import { getChecksumAddress } from './get-checksum-address.js';
import { ETHEREUM } from './ids/network.js';
import { ACCOUNT_TYPE, ADDRESS_ATTRIBUTE, NAME_ATTRIBUTE, NETWORK_ATTRIBUTE, TYPES_ATTRIBUTE } from './ids/system.js';

type MakeAccountReturnType = {
  accountId: string;
  ops: [CreateRelationOp, CreateRelationOp, SetTripleOp, SetTripleOp];
};

export function make(address: string): MakeAccountReturnType {
  const accountId = makeId();
  const checkedAddress = getChecksumAddress(address);

  return {
    accountId,
    ops: [
      // Types -> Account
      Relation.make({
        fromId: accountId,
        relationTypeId: TYPES_ATTRIBUTE,
        toId: ACCOUNT_TYPE,
      }),
      // Network -> Ethereum
      // Signals that the account is for the Ethereum family of chains
      Relation.make({
        fromId: accountId,
        relationTypeId: NETWORK_ATTRIBUTE,
        toId: ETHEREUM,
      }),
      {
        type: 'SET_TRIPLE',
        triple: {
          entity: accountId,
          attribute: ADDRESS_ATTRIBUTE,
          value: {
            type: 'TEXT',
            value: checkedAddress,
          },
        },
      },
      {
        type: 'SET_TRIPLE',
        triple: {
          entity: accountId,
          attribute: NAME_ATTRIBUTE,
          value: {
            type: 'TEXT',
            value: checkedAddress,
          },
        },
      },
    ],
  };
}
