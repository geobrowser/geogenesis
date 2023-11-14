'use client';

import { atom, useAtomValue, useSetAtom } from 'jotai';

import * as React from 'react';
import { ReactNode, createContext, useContext, useMemo } from 'react';

import { Environment } from '~/core/environment';
import { Publish, Storage, Subgraph } from '~/core/io';

type Services = {
  storageClient: Storage.IStorageClient;
  subgraph: Subgraph.ISubgraph;
  config: Environment.AppConfig;
  publish: Publish.IPublish;
};

const ServicesContext = createContext<Services | undefined>(undefined);

interface Props {
  children: ReactNode;
}

export const shouldUseSecondarySubgraphAtom = atom(false);

export function useSecondarySubgraph() {
  return useSetAtom(shouldUseSecondarySubgraphAtom);
}

export function ServicesProvider({ children }: Props) {
  const secondarySubgraph = useAtomValue(shouldUseSecondarySubgraphAtom);

  const services = useMemo((): Services => {
    let config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);
    const storageClient = new Storage.StorageClient(config.ipfs);

    if (secondarySubgraph) {
      config = {
        ...config,
        subgraph: config.permissionlessSubgraph,
      };
    }

    return {
      config,
      storageClient,
      subgraph: Subgraph,
      publish: Publish,
    };
  }, [secondarySubgraph]);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices() {
  const value = useContext(ServicesContext);

  if (!value) {
    throw new Error(`Missing ServicesProvider`);
  }

  return value;
}
