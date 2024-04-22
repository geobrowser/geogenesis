export const START_BLOCK = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : 36472424;
export const MANIFEST = './geo-substream.spkg';
export const IPFS_GATEWAY = 'https://ipfs.network.thegraph.com/api/v0/cat?arg=';

/* We could wire this up to the substream, but since we're hardcoding quite a bit already in bootstrapRoot.ts, this is probably fine */
export const ROOT_SPACE_CREATED_AT = 1670280473;
export const ROOT_SPACE_CREATED_AT_BLOCK = 36472429;
export const ROOT_SPACE_CREATED_BY_ID = '0x66703c058795B9Cb215fbcc7c6b07aee7D216F24';
