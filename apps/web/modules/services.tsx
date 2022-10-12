import { Log__factory } from '@geogenesis/contracts';
import { createContext, ReactNode, useContext, useEffect, useMemo } from 'react';
import { useNetwork } from 'wagmi';
import { getConfig } from './config';
import { AddressLoader } from './services/address-loader';
import { Network } from './services/network';
import { StorageClient } from './services/storage';
import { StubNetwork } from './services/stub-network';
import { TripleStore } from './state/triple-store';

type Services = {
  tripleStore: TripleStore;
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
      return {
        tripleStore: new TripleStore({
          api: new StubNetwork(),
        }),
      };
    }

    const config = getConfig(chainId);
    const addressLoader = new AddressLoader(config.devServer);
    const storageClient = new StorageClient(config.ipfs);

    return {
      tripleStore: new TripleStore({
        api: new Network(Log__factory, addressLoader, storageClient, config.subgraph),
      }),
    };
  }, [chainId]);

  useEffect(() => {
    // This is how we're loading the initial triples data rather than waiting the 5
    // seconds for it to populate. Ideally we can fetch them externally and pass them
    // to the store, but this is a good workaround for now since we can't really
    // inject data into the Next app outside of their server/static APIs
    services.tripleStore.loadNetworkTriples();
  }, [services.tripleStore]);

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
