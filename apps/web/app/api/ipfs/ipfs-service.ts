import { Effect, Either, Schedule } from 'effect';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { IpfsUploadError } from '~/core/errors';
import { slog } from '~/core/utils/utils';

export class IpfsService {
  constructor(public ipfsUrl: string) {}

  async upload(binary: Uint8Array): Promise<string> {
    const blob = new Blob([binary], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', blob);
    const url = `${this.ipfsUrl}/api/v0/add`;
    console.log(`Posting to url`, url);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${process.env.IPFS_KEY}`,
      },
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
      headers: {
        Authorization: `Bearer ${process.env.IPFS_KEY}`,
      },
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

export async function uploadToIpfsAction(data: Uint8Array) {
  const requestId = uuid();
  const ipfs = new IpfsService(Environment.getConfig().ipfs);

  const effect = Effect.retry(
    Effect.tryPromise({
      try: async () => {
        const hash = await ipfs.upload(data);
        return `ipfs://${hash}` as const;
      },
      catch: error => new IpfsUploadError(`IPFS upload failed: ${error}`),
    }),
    Schedule.exponential('100 millis').pipe(Schedule.jittered)
  );

  // Unfortunately we can't compose effects across client-server boundaries as
  // 'use server' expects exported functions to be async. So for uploading to
  // IPFS we go ahead and run the promise here instead of returning an effect
  // fiber back to the effect runtime caller. The caller can then wrap this
  // async call in tryPromise and handle the error.
  const result = await Effect.runPromise(Effect.either(effect));

  if (Either.isLeft(result)) {
    const error = result.left;
    slog({
      level: 'error',
      message: error.message,
      requestId,
    });

    throw error;
  }

  return result.right;
}

export async function uploadFileToIpfsAction(file: File) {
  const requestId = uuid();
  const ipfs = new IpfsService(Environment.getConfig().ipfs);

  const effect = Effect.retry(
    Effect.tryPromise({
      try: async () => {
        const hash = await ipfs.uploadFile(file);
        return `ipfs://${hash}` as const;
      },
      catch: error => new IpfsUploadError(`IPFS upload failed: ${error}`),
    }),
    Schedule.exponential('100 millis').pipe(Schedule.jittered)
  );

  // Unfortunately we can't compose effects across client-server boundaries as
  // 'use server' expects exported functions to be async. So for uploading to
  // IPFS we go ahead and run the promise here instead of returning an effect
  // fiber back to the effect runtime caller. The caller can then wrap this
  // async call in tryPromise and handle the error.
  const result = await Effect.runPromise(Effect.either(effect));

  if (Either.isLeft(result)) {
    const error = result.left;
    slog({
      level: 'error',
      message: error.message,
      requestId,
    });

    throw error;
  }

  return result.right;
}
