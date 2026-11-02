'use client';

import type { ComponentProps } from 'react';

import dynamic from 'next/dynamic';

import type { DebateShareDialog as ShareDialog } from './share-dialog';

// Load the formatter and share controls when the dialog opens, before any composer click.
const LazyShareDialog = dynamic(() => import('./share-dialog').then(module => module.DebateShareDialog), {
  ssr: false,
});

export function DebateShareDialog(props: ComponentProps<typeof ShareDialog>) {
  return props.open ? <LazyShareDialog {...props} /> : null;
}
