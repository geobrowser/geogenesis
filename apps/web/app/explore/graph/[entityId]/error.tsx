'use client';

import { useGraphExplorerUnavailable } from '~/core/graph-explorer/use-graph-explorer-active';
import { AutoRetryError } from '~/core/telemetry/auto-retry-error';

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** The app's error view, with the chrome the explorer route otherwise hides. */
export default function GraphExplorerError({ error, reset }: ErrorProps) {
  useGraphExplorerUnavailable();
  return <AutoRetryError error={error} reset={reset} />;
}
