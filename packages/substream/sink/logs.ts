import { Effect, LogLevel } from 'effect';

import { Environment } from './environment';

export function withRequestId(requestId: string) {
  return Effect.annotateLogs('request', requestId);
}

export const getConfiguredLogLevel = Effect.gen(function* (_) {
  const environment = yield* _(Environment);
  return environment.debug ? LogLevel.Debug : LogLevel.Info;
});
