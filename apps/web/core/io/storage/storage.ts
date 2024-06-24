import { Effect, Schedule } from 'effect';

import { IpfsUploadError } from '~/core/errors';

export interface IStorageClient {
  /** Upload a JSON-safe object */
  uploadObject(object: unknown): Promise<string>;
  uploadFile(file: File): Promise<string>;
  uploadBinary(binary: Uint8Array): Promise<string>;
}

export class StorageClient implements IStorageClient {
  constructor(public ipfsUrl: string) {}

  async uploadBinary(binary: Uint8Array): Promise<string> {
    const blob = new Blob([binary], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', blob);

    const url = `${this.ipfsUrl}/api/v0/add`;

    console.log(`Posting to url`, url);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (response.status >= 300) {
      const text = await response.text();
      console.log(text);
      return text;
    }

    const { Hash } = await response.json();

    console.log('ipfs hash', Hash);

    return Hash;
  }

  async uploadObject(object: unknown): Promise<string> {
    const blob = new Blob([JSON.stringify(object)], { type: 'application/json' });
    const formData = new FormData();
    formData.append('file', blob);

    const url = `${this.ipfsUrl}/api/v0/add`;

    console.log(`Posting to url`, url);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (response.status >= 300) {
      const text = await response.text();
      console.log(text);
      return text;
    }

    const { Hash } = await response.json();

    console.log('ipfs hash', Hash);

    return Hash;
  }

  async uploadFile(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.ipfsUrl}/api/v0/add`;

    console.log(`Posting to url`, url);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (response.status >= 300) {
      const text = await response.text();
      console.log(text);
      return text;
    }

    const { Hash } = await response.json();

    return `${this.ipfsUrl}/api/v0/cat?arg=${Hash}`;
  }
}

export function uploadBinary(
  binary: Uint8Array,
  storageClient: IStorageClient
): Effect.Effect<string, IpfsUploadError> {
  return Effect.retry(
    Effect.tryPromise({
      try: async () => {
        const hash = await storageClient.uploadBinary(binary);

        if (!hash.startsWith('Qm')) {
          throw new Error();
        }

        return `ipfs://${hash}`;
      },
      catch: error => new IpfsUploadError(`IPFS upload failed: ${error}`),
    }),
    Schedule.exponential('100 millis').pipe(Schedule.jittered)
  );
}
