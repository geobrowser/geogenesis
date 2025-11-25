import { Effect } from 'effect';

import { IpfsParseResponseError, IpfsUploadError } from '~/core/errors';

function upload(formData: FormData, url: string) {
  return Effect.gen(function* () {
    yield* Effect.logInfo(`Posting IPFS content to url`, url);

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: 'POST',
          body: formData,
          headers: {
            Authorization: `Bearer ${process.env.IPFS_KEY}`,
          },
        }),
      catch: error => new IpfsUploadError(`IPFS upload failed: ${error}`),
    });

    const { Hash } = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: error => new IpfsParseResponseError(`Could not parse IPFS JSON response: ${error}`),
    });

    return `ipfs://${Hash}` as const;
  });
}

export class IpfsService {
  constructor(public ipfsUrl: string) {}

  upload(binary: Uint8Array): Effect.Effect<`ipfs://${string}`, IpfsUploadError | IpfsParseResponseError> {
    const url = `${this.ipfsUrl}/api/v0/add`;

    return Effect.gen(function* () {
      const blob = new Blob([binary], { type: 'application/octet-stream' });
      const formData = new FormData();
      formData.append('file', blob);

      const hash = yield* upload(formData, url);

      yield* Effect.logInfo(`Uploaded binary to IPFS successfully`).pipe(Effect.annotateLogs({ hash }));

      return hash;
    });
  }

}
