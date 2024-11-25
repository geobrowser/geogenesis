import { encodeBase58 } from '@geogenesis/sdk';

/* We could wire this up to the substream, but since we're hardcoding quite a bit already in bootstrapRoot.ts, this is probably fine */
export const ROOT_SPACE_CREATED_AT = 1670280473;
export const ROOT_SPACE_CREATED_AT_BLOCK = 620;
export const ROOT_SPACE_CREATED_BY_ID = '0x66703c058795B9Cb215fbcc7c6b07aee7D216F24';

export const SPACE_ID = encodeBase58('ab7d4b9e02f840dab9746d352acb0ac6');
export const DAO_ADDRESS = '0x9e2342C55080f2fCb6163c739a88c4F2915163C4';
export const SPACE_ADDRESS = '0x7a260AC2D569994AA22a259B19763c9F681Ff84c';
export const MAIN_VOTING_ADDRESS = '0x379408c230817DC7aA36033BEDC05DCBAcE7DF50';
export const MEMBER_ACCESS_ADDRESS = '0xd09225EAe465f562719B9cA07da2E8ab286DBB36';

export const INITIAL_BLOCK = {
  blockNumber: ROOT_SPACE_CREATED_AT_BLOCK,
  cursor: '0',
  requestId: '-1',
  timestamp: ROOT_SPACE_CREATED_AT,
};
