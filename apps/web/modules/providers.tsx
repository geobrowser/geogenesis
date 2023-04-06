import * as React from 'react';

import { ActionsStoreProvider } from './action';
import { ReviewProvider } from './review';
import { Services } from './services';
import { WalletProvider } from './wallet';
import { LocalData } from '~/modules/io';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Services.Provider>
        <ActionsStoreProvider>
          <LocalData.LocalStoreProvider>
            <ReviewProvider>
              <WalletProvider>{children}</WalletProvider>
            </ReviewProvider>
          </LocalData.LocalStoreProvider>
        </ActionsStoreProvider>
      </Services.Provider>
    </QueryClientProvider>
  );
}
