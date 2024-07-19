'use client';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Provider as JotaiProvider } from 'jotai';

import * as React from 'react';

import { GraphqlProvider } from './gql/provider';
import { ReactQueryProvider } from './query-client';
import { Services } from './services';
import { DiffProvider } from './state/diff-store';
import { store } from './state/jotai-store';
import { StatusBarContextProvider } from './state/status-bar-store';
import { WalletProvider } from './wallet';
import { PrivyProvider } from './wallet/privy';

interface Props {
  children: React.ReactNode;
}

export function Providers({ children }: Props) {
  return (
    <GraphqlProvider>
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
    </GraphqlProvider>
  );
}
