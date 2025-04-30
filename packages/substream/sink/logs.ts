import { Effect, LogLevel, Logger } from 'effect';

import { Environment } from '../core/environment';

export const getConfiguredLogLevel = Effect.gen(function* (_) {
  const environment = yield* _(Environment);
  return environment.debug ? LogLevel.Debug : LogLevel.Info;
});

const logger = Logger.make(({ logLevel, message }) => {
  globalThis.console.log(`[${logLevel.label}]${message}`);
});

export const LoggerLive = Logger.replace(Logger.defaultLogger, logger);
