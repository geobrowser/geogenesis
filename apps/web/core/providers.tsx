'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Provider as JotaiProvider } from 'jotai';

import * as React from 'react';

import { Services } from './services';
import { DiffProvider } from './state/diff-store';
import { store } from './state/jotai-store';
import { StatusBarContextProvider } from './state/status-bar-store';
import { WalletProvider } from './wallet';
import { PrivyProvider } from './wallet/privy';
import { ReactQueryProvider } from './query-client';

interface Props {
  children: React.ReactNode;
}


export function Providers({ children }: Props) {
  return (
    <PrivyProvider>
      <ReactQueryProvider>
        <JotaiProvider store={store}>
          <WalletProvider>
            <Services.Provider>
              <StatusBarContextProvider>
                <DiffProvider>{children}</DiffProvider>
              </StatusBarContextProvider>
            </Services.Provider>
          </WalletProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </JotaiProvider>
      </ReactQueryProvider>
    </PrivyProvider>
  );
}
