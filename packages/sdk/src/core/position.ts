import { PositionSource } from 'position-strings';

/**
 * We use the Geo network id as the source id for all
 * relations consumed by the sdk.
 */
export const Position = new PositionSource({ ID: '' });
export const PositionRange = {
  FIRST: PositionSource.FIRST,
  LAST: PositionSource.LAST,
};
