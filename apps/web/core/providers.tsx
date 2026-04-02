'use client';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import * as React from 'react';

import { Provider as JotaiProvider } from 'jotai';
import dynamic from 'next/dynamic';
import { CookiesProvider } from 'react-cookie';

import { ReactQueryProvider } from './query-client';
import { SentryUserIdentifier } from './sentry-user-identifier';
import { DiffProvider } from './state/diff-store';
import { store } from './state/jotai-store';
import { StatusBarContextProvider } from './state/status-bar-store';
import { SyncEngineProvider } from './sync/use-sync-engine';

const LazyPrivyProvider = dynamic(() => import('./wallet/privy').then(m => ({ default: m.PrivyProvider })), {
  ssr: false,
});

const LazyWalletProvider = dynamic(() => import('./wallet').then(m => ({ default: m.WalletProvider })), {
  ssr: false,
});

interface Props {
  children: React.ReactNode;
}

export function Providers({ children }: Props) {
  return (
    <CookiesProvider>
      <LazyPrivyProvider>
        <ReactQueryProvider>
          <LazyWalletProvider>
            <SentryUserIdentifier />
            <JotaiProvider store={store}>
              <SyncEngineProvider>
                <StatusBarContextProvider>
                  <DiffProvider>{children}</DiffProvider>
                </StatusBarContextProvider>
                <ReactQueryDevtools initialIsOpen={false} />
              </SyncEngineProvider>
            </JotaiProvider>
          </LazyWalletProvider>
        </ReactQueryProvider>
      </LazyPrivyProvider>
    </CookiesProvider>
  );
}
