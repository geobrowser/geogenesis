import { NodeSdk } from '@effect/opentelemetry';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

import { ServerEnvironment } from './environment';

const exporter = ServerEnvironment.telemetryToken
  ? new OTLPTraceExporter({
      url: 'https://api.axiom.co/v1/traces', // Axiom API endpoint for trace data
      headers: {
        Authorization: ServerEnvironment.telemetryToken,
        'X-Axiom-Dataset': 'gaia.api',
      },
    })
  : undefined;

// Set up tracing with the OpenTelemetry SDK
export const Telemetry = NodeSdk.layer(() => ({
  resource: { serviceName: 'gaia.api' },
  spanProcessor: exporter ? new BatchSpanProcessor(exporter) : undefined,
}));
