import * as React from 'react';

import { ActionsStoreProvider } from './action';
import { ReviewProvider } from './review';
import { Services } from './services';
import { WalletProvider } from './wallet';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Services.Provider>
      <ActionsStoreProvider>
        <ReviewProvider>
          <WalletProvider>{children}</WalletProvider>
        </ReviewProvider>
      </ActionsStoreProvider>
    </Services.Provider>
  );
}
