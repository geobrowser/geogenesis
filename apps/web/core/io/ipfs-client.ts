import { Effect } from 'effect';

import { IpfsUploadError } from '~/core/errors';

import { uploadFileToIpfsAction, uploadToIpfsAction } from '~/app/api/upload';

/**
 * This class provides a simple namespace for interacting with the functions
 * used for uploading binary or files to IPFS. All IPFS interactions are done
 * on the server in the upload server actions.
 */
export class IpfsClient {
  static upload(binary: Uint8Array): Promise<`ipfs://${string}`> {
    return uploadToIpfsAction(binary);
  }

  static uploadFile(file: File): Promise<`ipfs://${string}`> {
    return uploadFileToIpfsAction(file);
  }
}

/**
 * This class provides a simple namespace for interacting with the functions
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
