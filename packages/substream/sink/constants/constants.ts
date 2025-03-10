export const MANIFEST = './geo-substream.spkg';
// export const IPFS_GATEWAY = 'https://ipfs.network.thegraph.com/api/v0/cat?arg=';
export const IPFS_GATEWAY = 'https://gateway.lighthouse.storage/ipfs/';

/* We could wire this up to the substream, but since we're hardcoding quite a bit already in bootstrapRoot.ts, this is probably fine */
export const ROOT_SPACE_CREATED_AT = 1670280473;
export const ROOT_SPACE_CREATED_AT_BLOCK = 620;
export const ROOT_SPACE_CREATED_BY_ID = '0x66703c058795B9Cb215fbcc7c6b07aee7D216F24';

export const US_LAW_SPACE = {
  id: 'Q5YFEacgaHtXE9Kub9AEkA',
  daoAddress: '0x22238cd64d914583f06223adfe9cddf9b45d1971',
  spacePluginAddress: '0x07801e72a8a722969663440385b906e1b073c948',
  mainVotingPluginAddress: '0x8Cb274d585393acd5277EC2B29ab56F2B604E4f0',
  memberAccessPluginAddress: '0x27e73AD87612098F9F7c2F456E9f4803DAcd899B',
};
