import { ServerEnvironment } from './environment';

export type Metric = {
  name: string;
} & (
  | {
      counter: {
        value: number;
      };
    }
  | {
      gauge: {
        value: number;
      };
    }
);

export class Telemetry {
  static metric(metric: Metric) {
    const { telemetryApiKey, telemetryUrl } = ServerEnvironment;

    if (!telemetryUrl || !telemetryApiKey) {
      return;
    }

    // @TODO proper o11y with tracing, logging, metrics, profiling, sampling, etc.
    fetch(telemetryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${telemetryApiKey}`,
      },
      body: JSON.stringify({
        dt: new Date()
          .toISOString()
          .replace('T', ' ')
          .replace(/\.\d+Z$/, ' UTC'),
        ...metric,
      }),
    });
  }
}
