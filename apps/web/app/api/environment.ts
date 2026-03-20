import { SENTRY_BUILD_CONFIG, TELEMETRY_TOKEN } from './config';

type ServerEnvironment = {
  telemetryToken?: string;
  sentryBuild?: {
    org: string;
    project: string;
    authToken: string;
  };
};

export const ServerEnvironment: ServerEnvironment = {
  telemetryToken: TELEMETRY_TOKEN,
  sentryBuild: SENTRY_BUILD_CONFIG,
};
