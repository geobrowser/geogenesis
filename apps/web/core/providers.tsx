'use client';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Provider as JotaiProvider, createStore } from 'jotai';

import * as React from 'react';

import { ReactQueryProvider } from './query-client';
import { Services } from './services';
import { ActiveProposalProvider } from './state/active-proposal-store';
import { DiffProvider } from './state/diff-store';
import { store } from './state/jotai-store';
import { StatusBarContextProvider } from './state/status-bar-store';
import { WalletProvider } from './wallet';

interface Props {
  children: React.ReactNode;
}

export function Providers({ children }: Props) {
  return (
    <ReactQueryProvider>
      <JotaiProvider store={store}>
        <WalletProvider>
          <Services.Provider>
            <StatusBarContextProvider>
              <DiffProvider>
                <ActiveProposalProvider>{children}</ActiveProposalProvider>
              </DiffProvider>
            </StatusBarContextProvider>
          </Services.Provider>
        </WalletProvider>
      </JotaiProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </ReactQueryProvider>
  );
}
