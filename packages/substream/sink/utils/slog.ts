import { Telemetry } from '~/sink/telemetry';

/**
 * Provides structured logging for Geo.
 * @param requestId - A unique identifier for the request. This should be used across all logs for a single request/workflow.
 * @param message - The message to log.
 * @param level - The log level. Defaults to 'info'.
 */
export function slog({
  requestId,
  message,
  level,
}: {
  requestId: string;
  message: string;
  level?: 'log' | 'info' | 'warn' | 'error';
}) {
  if (!level) {
    level = 'info';
  }

  const structuredMessage = `${level.toUpperCase()} – ${new Date().toISOString()} – ${message} – requestId: ${requestId}`;
  console[level](structuredMessage);

  if (level === 'error') {
    Telemetry.captureMessage(structuredMessage);
  }
}