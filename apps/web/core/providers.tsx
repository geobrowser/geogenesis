'use client';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Provider as JotaiProvider } from 'jotai';

import * as React from 'react';

import { ReactQueryProvider } from './query-client';
import { DiffProvider } from './state/diff-store';
import { store } from './state/jotai-store';
import { StatusBarContextProvider } from './state/status-bar-store';
import { SyncEngineProvider } from './sync/use-sync-engine';
import { WalletProvider } from './wallet';
import { PrivyProvider } from './wallet/privy';

interface Props {
  children: React.ReactNode;
}

export function Providers({ children }: Props) {
  return (
    <PrivyProvider>
      <ReactQueryProvider>
        <WalletProvider>
          <JotaiProvider store={store}>
            <SyncEngineProvider>
              <StatusBarContextProvider>
                <DiffProvider>{children}</DiffProvider>
              </StatusBarContextProvider>
              <ReactQueryDevtools initialIsOpen={false} />
            </SyncEngineProvider>
          </JotaiProvider>
        </WalletProvider>
      </ReactQueryProvider>
    </PrivyProvider>
  );
}
