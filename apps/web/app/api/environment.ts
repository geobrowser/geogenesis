import { TELEMETRY_TOKEN } from './config';

type ServerEnvironment = {
  telemetryToken?: string;
};

export const ServerEnvironment: ServerEnvironment = {
  telemetryToken: TELEMETRY_TOKEN,
};
