export class TransactionWriteFailedError extends Error {
  readonly _tag = 'TransactionWriteFailedError';
}

export class PrepareOpsError extends Error {
  readonly _tag = 'PrepareOpsError';
}

/** Submission succeeded; a receipt error cannot prove that the write failed. */
export class ReceiptConfirmationTimeoutError extends Error {
  override readonly name = 'ReceiptConfirmationTimeoutError';
}
