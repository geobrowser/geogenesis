import { SystemIds } from '@graphprotocol/grc-20';

import { Environment } from './environment';

export const ZERO_WIDTH_SPACE = '\u200b';
export const ALL_SPACES_IMAGE = 'ipfs://QmQXJYrbJJZcukgkzk8C71nQL1V8ND9TQjrtP4sKWjYPFH';
export const DEFAULT_OPENGRAPH_IMAGE = 'https://www.geobrowser.io/static/geo-social-image-v2.png';
export const PLACEHOLDER_SPACE_IMAGE = '/placeholder.png';
export const DEFAULT_OPENGRAPH_DESCRIPTION =
  "Browse and organize the world's public knowledge and information in a decentralized way.";
export const IPFS_GATEWAY_READ_PATH = `https://gateway.lighthouse.storage/ipfs/`;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const ROOT_SPACE_ID =
  Environment.variables.appEnv === 'production' ? SystemIds.ROOT_SPACE_ID : '2xBvgiT53h7njMQB4APGAu';
