import { GEO_PK, TELEMETRY_TOKEN } from './config';

type ServerEnvironment = {
  geoPk: string;
  telemetryToken?: string;
};

export const ServerEnvironment: ServerEnvironment = {
  geoPk: GEO_PK!,
  telemetryToken: TELEMETRY_TOKEN,
};
