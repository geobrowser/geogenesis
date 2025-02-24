import { GEO_PK, TELEMETRY_TOKEN, TELEMETRY_URL } from './config';

type ServerEnvironment = {
  geoPk: string;
  telemetryUrl?: string;
  telemetryApiKey?: string;
};

export const ServerEnvironment: ServerEnvironment = {
  geoPk: GEO_PK!,
  telemetryUrl: TELEMETRY_URL,
  telemetryApiKey: TELEMETRY_TOKEN,
};
