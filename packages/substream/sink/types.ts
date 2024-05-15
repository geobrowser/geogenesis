export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type TripleOp = 'SET_TRIPLE' | 'DELETE_TRIPLE';

export interface BlockEvent {
  cursor: string;
  blockNumber: number;
  timestamp: number;
  requestId: string; // uuid
}
