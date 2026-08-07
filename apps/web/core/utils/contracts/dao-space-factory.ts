import { EMPTY_SPACE_ID as SDK_EMPTY_SPACE_ID } from '@geoprotocol/geo-sdk/contracts';

import type { Hex } from 'viem';

// The DAOSpaceFactory *address* lives in ~/core/sdk/geo-network (network
// config, env-driven).

export const EMPTY_SPACE_ID = SDK_EMPTY_SPACE_ID as Hex;

export const NEW_SPACE_VOTING_DURATION_DAYS = 1;
