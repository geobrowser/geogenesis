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
 * used for uploading binary data to IPFS (e.g., edit proposals). All IPFS
 * interactions are done on the server as API routes.
 *
 * Note: For image uploads, use `Ipfs.uploadImage` from @graphprotocol/grc-20 instead.
 */
export class IpfsClient {
  /**
   * Uploads a binary blob to IPFS and returns the URI.
   * Used for uploading edit proposals.
   *
   * @param binary - The binary to upload as a Uint8Array.
   */
  static async upload(binary: Uint8Array): Promise<`ipfs://${string}`> {
    const blob = new Blob([binary], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', blob);
    console.log('[IPFS][binary] Uploading binary');

    const url = '/api/ipfs/upload';
    return await upload(url, formData);
  }
}

/**
 * This class provides a simple namespace for interacting with the API routes
 * used for uploading binary data to IPFS as effects (e.g., edit proposals).
 *
 * Note: For image uploads, use `Ipfs.uploadImage` from @graphprotocol/grc-20 instead.
 */
export class IpfsEffectClient {
  static upload(binary: Uint8Array): Effect.Effect<`ipfs://${string}`, IpfsUploadError> {
    return Effect.tryPromise({
      try: () => IpfsClient.upload(binary),
      catch: error => new IpfsUploadError(`IPFS upload failed: ${error}`),
    });
  }
}
