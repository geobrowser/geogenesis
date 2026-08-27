'use client';

import { AutoRetryError } from '~/core/telemetry/auto-retry-error';

export function DevErrorPreview() {
  const error = Object.assign(new Error('Preview error'), { digest: 'preview' });
  return <AutoRetryError error={error} reset={() => {}} preview />;
}
