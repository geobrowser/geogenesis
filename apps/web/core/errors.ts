export class TransactionWriteFailedError extends Error {
  readonly _tag = 'TransactionWriteFailedError';
}

export class IpfsUploadError extends Error {
  readonly _tag = 'IpfsUploadError';
}

export class IpfsParseResponseError extends Error {
  readonly _tag = 'IpfsParseResponseError';
}
