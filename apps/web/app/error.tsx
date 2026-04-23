'use client';

import { AutoRetryError } from '~/core/telemetry/auto-retry-error';

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  return <AutoRetryError error={error} reset={reset} />;
}
