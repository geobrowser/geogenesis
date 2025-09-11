export const IPFS_GATEWAY_READ_PATH = 'https://gateway.lighthouse.storage/ipfs/'

// Get the image hash from an image path
// e.g., https://gateway.lighthouse.storage/ipfs/HASH
// e.g., ipfs://HASH -> HASH
export const getImageHash = (value: string) => {
  // If the value includes a query parameter, it's thhe legacy hard coded IPFS gateway path
  if (value.startsWith(IPFS_GATEWAY_READ_PATH)) {
    const [, hash] = value.split(IPFS_GATEWAY_READ_PATH);
    return hash;
  } else if (value.includes('://')) {
    const [, hash] = value.split('://');
    return hash;
    // If the value does not contain an arg query parameter or protocol prefix, it already is a hash
  } else {
    return value;
  }
};


// Get the image URL from an image triple value
// this allows us to render images on the front-end based on a raw triple value
// e.g., ipfs://HASH -> https://api.thegraph.com/ipfs/api/v0/cat?arg=HASH
export const getImagePath = (value: string) => {
  // Add the IPFS gateway path for images with the ipfs:// protocol
  if (value.startsWith('ipfs://')) {
    return `${IPFS_GATEWAY_READ_PATH}${getImageHash(value)}`;
    // The image likely resolves to an image resource at some URL
  } else if (value.startsWith('http')) {
    return value;
  } else {
    // The image is likely a static, bundled path
    return value;
  }
};