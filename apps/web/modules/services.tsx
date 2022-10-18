import { createContext, ReactNode, useContext, useEffect, useMemo } from 'react';
import { useNetwork } from 'wagmi';
import { getConfig } from './config';
import { INetwork, Network } from './services/network';
import { StorageClient } from './services/storage';
import { StubNetwork } from './services/stub-network';
import { SpaceStore } from './state/space-store';

type Services = {
  network: INetwork;
  spaceStore: SpaceStore;
};

const ServicesContext = createContext<Services | undefined>(undefined);

interface Props {
  children: ReactNode;
}

export function ServicesProvider({ children }: Props) {
  const { chain } = useNetwork();

  const chainId = chain ? String(chain.id) : undefined;

  const services = useMemo((): Services => {
    if (!chainId) {
      const network = new StubNetwork();

      return {
        network,
        spaceStore: new SpaceStore({
          api: network,
        }),
      };
    }

    const config = getConfig(chainId);
    const storageClient = new StorageClient(config.ipfs);
    const network = new Network(storageClient, config.subgraph);

    return {
      network,
      spaceStore: new SpaceStore({
        api: network,
      }),
    };
  }, [chainId]);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices() {
  const value = useContext(ServicesContext);

  if (!value) {
    throw new Error(`Missing ServicesProvider`);
  }

  return value;
}

export function useSpaceStore() {
  return useServices().spaceStore;
}
