'use client';

import { usePathname } from 'next/navigation';

export const usePathSegments = () => {
  const pathname = usePathname();

  if (!pathname) return [];

  const pathSegments = pathname.split('/').filter(Boolean);

  return pathSegments;
};
