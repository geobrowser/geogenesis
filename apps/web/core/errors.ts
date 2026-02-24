export class TransactionWriteFailedError extends Error {
  readonly _tag = 'TransactionWriteFailedError';
}

export class PrepareOpsError extends Error {
  readonly _tag = 'PrepareOpsError';
}
