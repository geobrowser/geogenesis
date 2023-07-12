'use client';

import * as React from 'react';

import { ActionsStoreProvider } from './action';
import { DiffProvider } from './diff';
import { Services } from './services';
import { WalletProvider } from './wallet';
import { LocalData } from '~/modules/io';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Services.Provider>
        <ActionsStoreProvider>
          <LocalData.LocalStoreProvider>
            <DiffProvider>
              <WalletProvider>{children}</WalletProvider>
            </DiffProvider>
          </LocalData.LocalStoreProvider>
        </ActionsStoreProvider>
      </Services.Provider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
