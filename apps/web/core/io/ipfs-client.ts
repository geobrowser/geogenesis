import { Effect } from 'effect';

import { IpfsUploadError } from '~/core/errors';

/**
 * This class provides a simple namespace for interacting with the API routes
 * used for uploading binary or files to IPFS. All IPFS interactions are done
 * on the server as API routes.
 */
export class IpfsClient {
  static async upload(binary: Uint8Array): Promise<`ipfs://${string}`> {
    const blob = new Blob([binary], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', blob);

    const url = `/api/ipfs/upload`;
    console.log(`Posting to url`, url);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (response.status >= 300) {
      const text = await response.text();
      console.log(text);
      return `ipfs://${text}`;
    }

    const { hash } = await response.json();

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

    if (response.status >= 300) {
      const text = await response.text();
      console.log(text);
      return `ipfs://${text}`;
    }

    const { hash } = await response.json();
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
