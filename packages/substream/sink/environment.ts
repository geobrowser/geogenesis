import { Config, Context, Effect, Option, Secret } from 'effect';

export type IEnvironment = Readonly<{
  authIssueUrl: string;
  endpoint: string;
  apiKey: Secret.Secret;
  databaseUrl: Secret.Secret;
  debug: boolean | null;
  telemetryUrl: Secret.Secret | null;
}>;

const make = Effect.gen(function* (_) {
  const authIssueUrl = yield* _(Config.string('AUTH_ISSUE_URL'));
  const endpoint = yield* _(Config.string('SUBSTREAMS_ENDPOINT'));
  const apiKey = yield* _(Config.secret('SUBSTREAMS_API_KEY'));
  const databaseUrl = yield* _(Config.secret('DATABASE_URL'));
  const maybeDebug = yield* _(Config.option(Config.boolean('DEBUG')));

  const maybeTelemetryUrl = yield* _(Config.option(Config.secret('TELEMETRY_URL')));
  const telemetryUrl = Option.match(maybeTelemetryUrl, {
    onSome: o => o,
    onNone: () => null,
  });
  const debug = Option.match(maybeDebug, {
    onSome: o => o,
    onNone: () => null,
  });

  return {
    authIssueUrl,
    endpoint,
    apiKey,
    databaseUrl,
    telemetryUrl,
    debug,
  } as const;
});

export class Environment extends Context.Tag('environment')<Environment, IEnvironment>() {}
export const EnvironmentLive: IEnvironment = Effect.runSync(make);
