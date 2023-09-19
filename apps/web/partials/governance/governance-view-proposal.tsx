'use client';

import * as React from 'react';

import { SlideUp } from '~/design-system/slide-up';

interface GovernanceProposalState {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const GovernanceProposalContext = React.createContext<GovernanceProposalState | null>(null);

export function GovernanceProposalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <GovernanceProposalContext.Provider
      value={{
        isOpen,
        setIsOpen,
      }}
    >
      {children}
    </GovernanceProposalContext.Provider>
  );
}

export function useGovernanceProposal() {
  const context = React.useContext(GovernanceProposalContext);

  if (!context) {
    throw new Error('useGovernanceProposal must be used within a GovernanceProposalProvider');
  }

  return context;
}

interface Props {
  proposalContent: React.ReactNode;
}

export function GovernanceViewProposal({ proposalContent }: Props) {
  const { isOpen, setIsOpen } = useGovernanceProposal();

  return (
    <SlideUp isOpen={isOpen} setIsOpen={setIsOpen}>
      {proposalContent}
    </SlideUp>
  );
}
