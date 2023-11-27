import { fetchRetry } from "./fetchRetry.js";


export async function ipfsFetch(cid: string) {
    const parsedCid = cid.replace("ipfs://", "")
    const url = "https://ipfs.network.thegraph.com/api/v0/cat?arg=" + parsedCid 
    try {
        const response = await fetchRetry(url, {
            retryDelay: function(attempt) {
                return Math.pow(2, attempt) * 1000; 
            }
        });
        const json = await response.json();
        return json
    } catch (error) {
        console.error(error);
    }
}
