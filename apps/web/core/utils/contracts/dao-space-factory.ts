import type { Hex } from 'viem';

import { Environment } from '~/core/environment';

/**
 * DaoSpaceFactory address. Same pattern as SPACE_REGISTRY_ADDRESS — resolves to the local
 * stack's factory in local-dev mode, hardcoded testnet otherwise. See space-registry.ts.
 */
const TESTNET_DAO_SPACE_FACTORY_ADDRESS = '0x322A3eD5f7f40262a95C51457f56a8c762C27226' as const;

export const DAO_SPACE_FACTORY_ADDRESS: `0x${string}` =
  Environment.variables.isLocalDev && Environment.variables.localContracts
    ? Environment.variables.localContracts.daoSpaceFactory
    : TESTNET_DAO_SPACE_FACTORY_ADDRESS;

export const EMPTY_SPACE_ID = '0x00000000000000000000000000000000' as Hex;

export const NEW_SPACE_VOTING_DURATION_DAYS = 1;
