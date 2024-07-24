import { Effect } from 'effect';

import { IpfsUploadError } from '~/core/errors';

import { uploadFileToIpfsAction, uploadToIpfsAction } from '~/app/api/upload';

export class IpfsClient {
  static upload(binary: Uint8Array): Effect.Effect<`ipfs://${string}`, IpfsUploadError> {
    return Effect.tryPromise({
      try: () => uploadToIpfsAction(binary),
      catch: error => new IpfsUploadError(`IPFS upload failed: ${error}`),
    });
  }

  static uploadFile(file: File): Effect.Effect<`ipfs://${string}`, IpfsUploadError> {
    return Effect.tryPromise({
      try: () => uploadFileToIpfsAction(file),
      catch: error => new IpfsUploadError(`IPFS upload failed: ${error}`),
    });
  }
}
