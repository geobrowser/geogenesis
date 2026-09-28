import * as React from 'react';

import type { Metadata } from 'next';

import { notFound } from 'next/navigation';

import { bountiesEnabledForNetwork } from '~/core/bounties/config';

import { BountiesPageClient } from './bounties-page-client';

export const metadata: Metadata = {
  title: 'Bounties',
  robots: { index: false },
};

export default function BountiesPage() {
  // Hard gate: on a build where bounties are off (mainnet) the route does not exist.
  if (!bountiesEnabledForNetwork) notFound();

  return <BountiesPageClient />;
}
