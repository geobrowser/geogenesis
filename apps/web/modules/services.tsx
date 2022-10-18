import { Log__factory } from '@geogenesis/contracts';
import { createContext, ReactNode, useContext, useEffect, useMemo } from 'react';
import { useNetwork } from 'wagmi';
import { getConfig } from './config';
import { AddressLoader } from './services/address-loader';
import { Network } from './services/network';
import { StorageClient } from './services/storage';
import { StubNetwork } from './services/stub-network';
import { SpaceStore } from './state/space-store';
import { TripleStore } from './state/triple-store';

type Services = {
  tripleStore: TripleStore;
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
        tripleStore: new TripleStore({
          api: network,
        }),
        spaceStore: new SpaceStore({
          api: network,
        }),
      };
    }

    const config = getConfig(chainId);
    const addressLoader = new AddressLoader(config.devServer);
    const storageClient = new StorageClient(config.ipfs);
    const network = new Network(Log__factory, addressLoader, storageClient, config.subgraph);

    return {
      tripleStore: new TripleStore({
        api: network,
      }),
      spaceStore: new SpaceStore({
        api: network,
      }),
    };
  }, [chainId]);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

function useServices() {
  const value = useContext(ServicesContext);

  if (!value) {
    throw new Error(`Missing ServicesProvider`);
  }

  return value;
}

export function useTripleStore() {
  return useServices().tripleStore;
}

export function useSpaceStore() {
  return useServices().spaceStore;
}
