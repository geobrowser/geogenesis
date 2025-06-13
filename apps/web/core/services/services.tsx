'use client';

import * as React from 'react';
import { ReactNode, createContext, useContext, useMemo } from 'react';

import { Environment } from '~/core/environment';

import { IpfsClient } from '../io/ipfs-client';

type Services = {
  ipfs: {
    uploadFile: typeof IpfsClient.uploadFile;
    upload: typeof IpfsClient.upload;
  };
  config: Environment.AppConfig;
};

const ServicesContext = createContext<Services | undefined>(undefined);

interface Props {
  children: ReactNode;
}

export function ServicesProvider({ children }: Props) {
  const services = useMemo((): Services => {
    const config = Environment.getConfig();

    return {
      ipfs: {
        uploadFile: IpfsClient.uploadFile,
        upload: IpfsClient.upload,
      },
      config,
    };
  }, []);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices() {
  const value = useContext(ServicesContext);

  if (!value) {
    throw new Error(`Missing ServicesProvider`);
  }

  return value;
}
