const TELEMETRY_URL = process.env.TELEMETRY_URL;
const TELEMETRY_TOKEN = process.env.TELEMETRY_TOKEN;

const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;

type SentryBuildConfig = {
  org: string;
  project: string;
  authToken: string;
};

const sentryBuildVarCount = [SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN].filter(Boolean).length;

if (sentryBuildVarCount > 0 && sentryBuildVarCount < 3) {
  throw new Error('SENTRY_ORG, SENTRY_PROJECT, and SENTRY_AUTH_TOKEN must be set together');
}

const SENTRY_BUILD_CONFIG: SentryBuildConfig | undefined =
  sentryBuildVarCount === 3
    ? {
        org: SENTRY_ORG!,
        project: SENTRY_PROJECT!,
        authToken: SENTRY_AUTH_TOKEN!,
      }
    : undefined;

export { TELEMETRY_URL, TELEMETRY_TOKEN, SENTRY_BUILD_CONFIG };
