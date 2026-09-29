'use client';

import { useGeoLogin } from '@geogenesis/auth';

import { useCallback } from 'react';

import { type AnalyticsProperties } from '~/core/analytics';
import { beginPrivyAuth } from '~/core/privy-auth-events';

/** Capture attribution at the press; the persistent observer owns completion tracking. */
export function useTrackedLogin(params: Parameters<typeof useGeoLogin>[0]) {
  const { login } = useGeoLogin(params);
  const trackedLogin = useCallback(
    (properties?: AnalyticsProperties) => {
      beginPrivyAuth(properties);
      login();
    },
    [login]
  );
  return { login: trackedLogin };
}
