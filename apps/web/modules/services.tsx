import { createContext, ReactNode, useContext, useMemo } from 'react';
import { useNetwork } from 'wagmi';
import { Config } from './config';
import { INetwork, Network } from './services/network';
import { StorageClient } from './services/storage';
import { SpaceStore } from './spaces/space-store';

type Services = {
  network: INetwork;
  spaceStore: SpaceStore;
};

const ServicesContext = createContext<Services | undefined>(undefined);

interface Props {
  children: ReactNode;
}

function ServicesProvider({ children }: Props) {
  const { chain } = useNetwork();

  // Default to production chain
  const chainId = chain ? String(chain.id) : Config.options.production.chainId;

  const services = useMemo((): Services => {
    const config = Config.getConfig(chainId);
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

function useServices() {
  const value = useContext(ServicesContext);

  if (!value) {
    throw new Error(`Missing ServicesProvider`);
  }

  return value;
}

export const Services = {
  Provider: ServicesProvider,
  useServices,
};
