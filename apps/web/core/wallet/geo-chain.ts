import { getGeoChain } from '@geogenesis/auth/server';

import { Environment } from '../environment';

const chainId = Environment.getConfig().chainId;

/**
 * @TODO: getGeoChain should handle the chainId. Currently we use chainId to switch between
 * TESTNET and MAINNET dynamically within the app. We should use a human-understandable label
 * like MAINNET or TESTNET instead though.
 */
export const GEOGENESIS = chainId === '19411' ? getGeoChain('TESTNET') : getGeoChain('MAINNET');
