'use client';

import { useEffect } from 'react';

import { usePathname, useSearchParams } from 'next/navigation';

import { pageViewed } from '~/core/analytics';

export function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      pageViewed();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [pathname, search]);

  return null;
}
