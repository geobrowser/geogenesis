'use client';

import * as React from 'react';

import { useSearchParams } from 'next/navigation';

export function OverviewTabOnly({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const tabId = searchParams?.get('tabId');

  if (tabId) return null;

  return <>{children}</>;
}
