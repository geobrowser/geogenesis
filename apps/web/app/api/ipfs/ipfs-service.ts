import { Effect } from 'effect';

import { IpfsParseResponseError, IpfsUploadError } from '~/core/errors';

import { Metrics } from '../metrics';
import { Telemetry } from '../telemetry';

function upload(formData: FormData, url: string) {
  return Effect.gen(function* () {
    console.log(`Posting to url`, url);

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

    if (response.status >= 300) {
      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: error => new IpfsParseResponseError(`Could not parse IPFS text response with status >= 300: ${error}`),
      });
      console.log(text);
      return `ipfs://${text}` as const;
    }

    const { Hash } = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: error => new IpfsParseResponseError(`Could not parse IPFS JSON response: ${error}`),
    });

    console.log('ipfs hash', Hash);
    return `ipfs://${Hash}` as const;
  });
}

export class IpfsService {
  constructor(public ipfsUrl: string) {}

  upload(binary: Uint8Array): Effect.Effect<`ipfs://${string}`, IpfsUploadError | IpfsParseResponseError> {
    const url = `${this.ipfsUrl}/api/v0/add`;

    return Effect.gen(function* () {
      const startTime = Date.now();

      const blob = new Blob([binary], { type: 'application/octet-stream' });
      const formData = new FormData();
      formData.append('file', blob);

      const hash = yield* upload(formData, url);

      const endTime = Date.now() - startTime;
      Telemetry.metric(Metrics.timing('ipfs_upload_binary_duration', endTime));

      return hash;
    });
  }

  uploadFile(file: File): Effect.Effect<`ipfs://${string}`, IpfsUploadError | IpfsParseResponseError> {
    const url = `${this.ipfsUrl}/api/v0/add`;

    return Effect.gen(function* () {
      const startTime = Date.now();

      const formData = new FormData();
      formData.append('file', file);

      const hash = yield* upload(formData, url);

      const endTime = Date.now() - startTime;
      Telemetry.metric(Metrics.timing('ipfs_upload_file_duration', endTime));

      return hash;
    });
  }
}
