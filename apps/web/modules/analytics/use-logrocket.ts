'use client';

import LogRocket from 'logrocket';
import setupLogRocketReact from 'logrocket-react';
import { useAccount } from 'wagmi';

import { useAccessControl } from '../auth/use-access-control';

export function useLogRocket(space: string) {
  const { isEditor, isAdmin } = useAccessControl(space);
  const { address } = useAccount();

  const isProduction = process.env.NODE_ENV === 'production';
  const isPrivilegedUser = isEditor || isAdmin;

  if (isPrivilegedUser && isProduction) {
    console.log('LogRocket init');
    LogRocket.init('geo/geo-web-app');
    setupLogRocketReact(LogRocket);

    if (address) {
      LogRocket.identify(address);
    }
  }
}
