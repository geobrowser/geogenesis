import { Client, Context, ContextParams, TokenVotingClient } from '@aragon/sdk-client';

import { createContext, useContext, useEffect, useState } from 'react';

import { CHAINS, settings } from '../constants';
import { SupportedChainIds } from '../types';
import { IpfsNode } from './aragon-provider';

export interface AragonSDKContextValue {
  context?: Context;
  baseClient?: Client;
  tokenVotingClient?: TokenVotingClient;
}

const AragonSDKContext = createContext<AragonSDKContextValue>({});

/**
 * AragonSDKWrapper is a context provider component that wraps the application to provide access
 * to the Aragon SDK.
 */
export function AragonSDKWrapper({
  children,
  ipfsNodes,
}: {
  children: JSX.Element;
  ipfsNodes?: IpfsNode[];
}): JSX.Element {
  const { signer, chain } = useConnectedWallet();
  const [context, setContext] = useState<Context | undefined>(undefined);
  const [baseClient, setBaseClient] = useState<Client | undefined>(undefined);
  const [tokenVotingClient, setTokenVotingClient] = useState<TokenVotingClient | undefined>(undefined);

  useEffect(() => {
    if (!signer || !chain) return;

    // check if chain is valid
    if (!Object.values(CHAINS).includes(chain as SupportedChainIds)) {
      console.error(`Invalid chain type: ${chain}`);
      return;
    }

    const aragonSDKContextParams: ContextParams = {
      network: chain || 5,
      signer,
      ...settings(chain as SupportedChainIds, ipfsNodes),
    };
    const contextInstance = new Context(aragonSDKContextParams);
    const contextPlugin = ContextPlugin.fromContext(contextInstance);
    setContext(contextInstance);
    setBaseClient(new Client(contextInstance));
    setTokenVotingClient(new TokenVotingClient(contextPlugin));
  }, [signer, chain, ipfsNodes]);

  return (
    <AragonSDKContext.Provider
      value={{
        context,
        baseClient,
        tokenVotingClient,
      }}
    >
      {children}
    </AragonSDKContext.Provider>
  );
}

/**
 * useAragon is a custom hook to access the AragonSDKContext.
 * @throws {Error} if used outside of AragonSDKWrapper
 */
export function useAragon(): AragonSDKContextValue {
  const context = useContext(AragonSDKContext);
  if (!context) throw new Error('useAragon hooks must be used within an AragonSDKWrapper');
  return context;
}
