'use client';

import * as React from 'react';
import { createContext, useContext, useState } from 'react';

type ActiveProposalState = {
  isActiveProposalOpen: boolean;
  setIsActiveProposalOpen: (value: boolean) => void;
  activeProposalId: string;
  setActiveProposalId: (value: string) => void;
};

const initialActiveProposalState = {
  isActiveProposalOpen: false,
  setIsActiveProposalOpen: (value: boolean) => null,
  activeProposalId: '',
  setActiveProposalId: (value: string) => null,
};

const ActiveProposalContext = createContext<ActiveProposalState>(initialActiveProposalState);

type ActiveProposalProviderProps = {
  children: React.ReactNode;
};

export const ActiveProposalProvider = ({ children }: ActiveProposalProviderProps) => {
  const [isActiveProposalOpen, setIsActiveProposalOpen] = useState<boolean>(false);
  const [activeProposalId, setActiveProposalId] = useState<string>('');

  return (
    <ActiveProposalContext.Provider
      value={{
        isActiveProposalOpen,
        setIsActiveProposalOpen,
        activeProposalId,
        setActiveProposalId,
      }}
    >
      {children}
    </ActiveProposalContext.Provider>
  );
};

export const useActiveProposal = () => {
  const value = useContext(ActiveProposalContext);

  if (!value) {
    throw new Error(`useActiveProposal must be used within a ActiveProposalProvider`);
  }

  return value;
};
