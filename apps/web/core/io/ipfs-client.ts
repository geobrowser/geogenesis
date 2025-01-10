import { Effect } from 'effect';

import { IpfsUploadError } from '~/core/errors';

export function validateCid(cid: string) {
  const [, cidContains] = cid.split('ipfs://');
  if (!cid.startsWith('ipfs://')) {
    throw new IpfsUploadError(`CID ${cid} does not start with ipfs://`);
  }

  if (cidContains === undefined || cidContains === '') {
    throw new IpfsUploadError(`CID ${cid} is not valid`);
  }

  return true;
}

/**
 * This class provides a simple namespace for interacting with the API routes
 * used for uploading binary or files to IPFS. All IPFS interactions are done
 * on the server as API routes.
 */
export class IpfsClient {
  /**
   * Uploads a binary blob to IPFS and returns the URI.
   *
   * @param binary - The binary to upload as a Uint8Array.
   * @param baseUrl - The base URL to use for the upload. This is required if calling
   *                  the API from a route handler. If calling from the client it's
   *                  okay to call the route handler using a relative URL.
   */
  static async upload(binary: Uint8Array): Promise<`ipfs://${string}`> {
    const blob = new Blob([binary], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', blob);

    const url = '/api/ipfs/upload';
    console.log(`Posting to url`, url);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    const { hash } = await response.json();
    validateCid(hash);

    console.log('ipfs hash', hash);
    return hash;
  }

  static async uploadFile(file: File): Promise<`ipfs://${string}`> {
    const formData = new FormData();
    formData.append('file', file);

    const url = `/api/ipfs/upload-file`;
    console.log(`Posting to url`, url);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    const { hash } = await response.json();
    validateCid(hash);

    console.log('ipfs hash', hash);
    return hash;
  }
}

/**
 * This class provides a simple namespace for interacting with the API routes
 * used for uploading binary or files to IPFS as effects.
 */
export class IpfsEffectClient {
  static upload(binary: Uint8Array): Effect.Effect<`ipfs://${string}`, IpfsUploadError> {
    return Effect.tryPromise({
      try: () => IpfsClient.upload(binary),
      catch: error => new IpfsUploadError(`IPFS upload failed: ${error}`),
    });
  }

  static uploadFile(file: File): Effect.Effect<`ipfs://${string}`, IpfsUploadError> {
    return Effect.tryPromise({
      try: () => IpfsClient.uploadFile(file),
      catch: error => new IpfsUploadError(`IPFS upload failed: ${error}`),
    });
  }
}
