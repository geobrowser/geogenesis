import { IPFS_GATEWAY } from '../constants/constants.js';
import { fetchRetry } from './fetch-retry.js';

export async function ipfsFetch(cid: string) {
  const parsedCid = cid.replace('ipfs://', '');
  const url = `${IPFS_GATEWAY}${parsedCid}`;

  try {
    // @TODO: Use effect
    const response = await fetchRetry(url, {
      retryDelay: function (attempt) {
        return Math.pow(2, attempt) * 1000;
      },
    });
    const json = await response.json();
    return json;
  } catch (error) {
    console.error(error);
  }
}
