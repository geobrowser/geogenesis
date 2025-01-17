import { Duration, Effect, Schedule } from 'effect';

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

async function upload(url: string, formData: FormData) {
  const run = Effect.gen(function* () {
    console.log(`[IPFS][upload] Writing content to url`, url);

    const response = yield* Effect.tryPromise({
      try: async () => {
        return await fetch(url, {
          method: 'POST',
          body: formData,
        });
      },
      catch: error => new IpfsUploadError(`IPFS upload failed: ${error}`),
    });

    const { hash } = yield* Effect.tryPromise({
      try: async () => {
        return await response.json();
      },
      catch: error => new IpfsUploadError(`IPFS upload failed: ${error}`),
    });
    validateCid(hash);

    console.log('[IPFS][upload] Hash:', hash);
    return hash as `ipfs://${string}`; // validated above
  });

  const retryable = Effect.retry(
    run,
    Schedule.exponential('100 millis').pipe(
      Schedule.jittered,
      Schedule.compose(Schedule.elapsed),
      Schedule.tapInput(() => Effect.succeed(console.log('[IPFS][upload] Retrying'))),
      Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(30)))
    )
  );
  return await Effect.runPromise(retryable);
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
    console.log('[IPFS][binary] Uploading binary');

    const url = '/api/ipfs/upload';
    return await upload(url, formData);
  }

  static async uploadFile(file: File): Promise<`ipfs://${string}`> {
    const formData = new FormData();
    formData.append('file', file);
    console.log('[IPFS][file] Uploading file');

    const url = `/api/ipfs/upload-file`;
    return await upload(url, formData);
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
