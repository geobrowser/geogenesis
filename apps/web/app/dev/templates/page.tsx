import type { Metadata } from 'next';

import { notFound } from 'next/navigation';

import { DevTemplatesPreview } from './preview';

export const metadata: Metadata = {
  title: 'Entity Templates Preview',
  robots: {
    index: false,
    follow: false,
  },
};

export default function DevTemplatesPage() {
  if (process.env.NODE_ENV !== 'development' && process.env.NEXT_PUBLIC_ENABLE_DEV_PREVIEWS !== '1') {
    notFound();
  }

  return <DevTemplatesPreview />;
}
