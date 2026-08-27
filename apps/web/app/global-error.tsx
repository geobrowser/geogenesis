'use client';

import { AutoRetryError } from '~/core/telemetry/auto-retry-error';

import '../styles/styles.css';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body>
        <AutoRetryError error={error} reset={reset} />
      </body>
    </html>
  );
}
