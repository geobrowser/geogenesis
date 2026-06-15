import type { Hex } from 'viem';

import { Environment } from '~/core/environment';

/**
 * DaoSpaceFactory address. Same pattern as SPACE_REGISTRY_ADDRESS — resolves to the local
 * stack's factory in local-dev mode, hardcoded testnet otherwise. See space-registry.ts.
 */
const TESTNET_DAO_SPACE_FACTORY_ADDRESS = '0x19f56F9Ed2c2ED2B5884668E392DcA4396F7feBd' as const;

export const DAO_SPACE_FACTORY_ADDRESS: `0x${string}` =
  Environment.variables.isLocalDev && Environment.variables.localContracts
    ? Environment.variables.localContracts.daoSpaceFactory
    : TESTNET_DAO_SPACE_FACTORY_ADDRESS;

export const EMPTY_SPACE_ID = '0x00000000000000000000000000000000' as Hex;

export const NEW_SPACE_VOTING_DURATION_DAYS = 1;
