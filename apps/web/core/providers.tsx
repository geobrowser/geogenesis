'use client';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Provider as JotaiProvider } from 'jotai';

import * as React from 'react';

import { ReactQueryProvider } from './query-client';
import { Services } from './services';
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
    <ReactQueryProvider>
      <PrivyProvider>
          <JotaiProvider store={store}>
            <SyncEngineProvider>
              <WalletProvider>
                <Services.Provider>
                  <StatusBarContextProvider>
                    <DiffProvider>{children}</DiffProvider>
                  </StatusBarContextProvider>
                </Services.Provider>
              </WalletProvider>
              <ReactQueryDevtools initialIsOpen={false} />
            </SyncEngineProvider>
          </JotaiProvider>
      </PrivyProvider>
    </ReactQueryProvider>
  );
}
