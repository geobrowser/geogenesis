'use client';

import * as React from 'react';

import { ActionsStoreProvider } from './state/actions-store';
import { DiffProvider } from './state/diff-store/diff-store';
import { Services } from './services';
import { WalletProvider } from './wallet';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { LocalStoreProvider } from './state/local-store';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Services.Provider>
        <ActionsStoreProvider>
          <LocalStoreProvider>
            <DiffProvider>
              <WalletProvider>{children}</WalletProvider>
            </DiffProvider>
          </LocalStoreProvider>
        </ActionsStoreProvider>
      </Services.Provider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
