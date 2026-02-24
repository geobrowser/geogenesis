import { Environment } from '~/core/environment';

export const telemetryDsn = Environment.variables.sentryDsn;

export const isTelemetryEnabled = Boolean(telemetryDsn);
