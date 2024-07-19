import { UrqlProvider, cacheExchange, createClient, fetchExchange, ssrExchange } from '@urql/next';

import * as React from 'react';

import { Environment } from '../environment';

export function GraphqlProvider({ children }: { children: React.ReactNode }) {
  const [client, ssr] = React.useMemo(() => {
    const ssr = ssrExchange({
      isClient: typeof window !== 'undefined',
    });
    const client = createClient({
      url: Environment.getConfig().api,
      exchanges: [cacheExchange, ssr, fetchExchange],
      suspense: true,
    });

    return [client, ssr];
  }, []);

  return (
    <UrqlProvider client={client} ssr={ssr}>
      {children}
    </UrqlProvider>
  );
}
