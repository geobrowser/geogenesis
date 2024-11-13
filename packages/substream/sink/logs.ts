import { Effect } from 'effect';

export function withRequestId(requestId: string) {
  return Effect.annotateLogs('request', requestId);
}
