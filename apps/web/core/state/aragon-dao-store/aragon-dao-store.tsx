import React, { ReactNode } from 'react';

import { AragonSDKWrapper } from './aragon-context';

export interface IpfsNode {
  url: string;
  headers: any;
}
export interface Config {
  ipfsNodes?: IpfsNode[] | undefined;
}

export interface AragonProviderProps {
  children: ReactNode;
  config?: Config;
}

export function AragonProvider({ children, config }: AragonProviderProps) {
  return (
    <AragonSDKWrapper ipfsNodes={config?.ipfsNodes}>
      <>{children}</>
    </AragonSDKWrapper>
  );
}
