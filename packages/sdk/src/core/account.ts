import { createGeoId } from '../id';
import { Relation } from '../relation';
import type { SetTripleOp } from '../types';
import { getChecksumAddress } from './get-checksum-address';
import { ETHEREUM } from './ids/network';
import { ACCOUNT_TYPE, ADDRESS_ATTRIBUTE, NAME, NETWORK_ATTRIBUTE, TYPES } from './ids/system';

type MakeAccountReturnType = {
  accountId: string;
  ops: SetTripleOp[];
};

export function make(address: string): MakeAccountReturnType {
  const accountId = createGeoId();
  const checkedAddress = getChecksumAddress(address);

  return {
    accountId,
    ops: [
      // Types -> Account
      ...Relation.make({
        fromId: accountId,
        relationTypeId: TYPES,
        toId: ACCOUNT_TYPE,
      }),
      // Network -> Ethereum
      // Signals that the account is for the Ethereum family of chains
      ...Relation.make({
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
          attribute: NAME,
          value: {
            type: 'TEXT',
            value: checkedAddress,
          },
        },
      },
    ],
  };
}
