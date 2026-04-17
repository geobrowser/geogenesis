'use client';

import { notFound } from 'next/navigation';

import { AutoRetryError } from '~/core/telemetry/auto-retry-error';

export default function DevErrorPreview() {
  if (process.env.NEXT_PUBLIC_ENABLE_DEV_PREVIEWS !== '1') {
    notFound();
  }

  const error = Object.assign(new Error('Preview error'), { digest: 'preview' });

  return <AutoRetryError error={error} reset={() => {}} preview />;
}
