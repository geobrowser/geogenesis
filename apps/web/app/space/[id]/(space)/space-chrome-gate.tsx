'use client';

import * as React from 'react';

import { usePathname } from 'next/navigation';

/**
 * The debates surface is full-screen and edge-to-edge (TikTok-style feed): no
 * space header, metadata, or tabs. This gate hides that chrome on any
 * `/space/<id>/debates...` route while keeping it everywhere else.
 */
export function SpaceChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname && /\/debates(\/|$)/.test(pathname)) return null;
  return <>{children}</>;
}
