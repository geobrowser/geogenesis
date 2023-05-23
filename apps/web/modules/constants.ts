export const ZERO_WIDTH_SPACE = '\u200b';

export const PLACEHOLDER_IMAGES = {
  'San Francisco': 'https://cdn.discordapp.com/attachments/1010259815395754147/1047945562336534588/SF-image.png',
  Health: 'https://images.unsplash.com/photo-1535914254981-b5012eebbd15',
  Values: 'https://images.unsplash.com/photo-1637008336770-b95d637fd5fa',
};

export const ROOT_SPACE_IMAGE =
  'https://api.thegraph.com/ipfs/api/v0/cat?arg=QmU3TRxyXGKbgCFPFVddJmRnxHQ6ojnppumU3zpPUjJ4WK';

export const DEFAULT_OPENGRAPH_IMAGE = 'https://www.geobrowser.io/static/geo-social-image-v2.png';

// Right now there is no way to remove Spaces from the Space Registry and Subgraph store.
// Temporarily we just filter some Spaces when we fetch Spaces.
export const HIDDEN_SPACES: Array<string> = [
  '0x276187Ac0D3a61EAAf3D5Af443dA932EFba7A661', // Abundant Housing in San Francisco
  '0xdb1c4a316933cd481860cfCa078eE07ea7Ad4EdD', // Transitional Housing in San Francisco
  '0xEC07c19743179f1AC904Fee97a1A99310e500aB6', // End Homelessness in San Francisco
  '0x1b7a66284C31A8D11a790ec79916c425Ef6E7886', // The Graph
];
