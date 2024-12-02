import { PositionSource } from 'position-strings';

import { GEO } from './ids/network.js';

/**
 * We use the Geo network id as the source id for all
 * relations consumed by the sdk.
 */
export const Position = new PositionSource({ ID: GEO });
export const PositionRange = {
  FIRST: PositionSource.FIRST,
  LAST: PositionSource.LAST,
};
