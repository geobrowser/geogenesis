'use client';

import * as React from 'react';

export type GovernanceSpaceOption = { id: string; name: string; image: string | null };

type GovernanceHomeChrome = {
  editorSpaceOptions: GovernanceSpaceOption[];
  myProposalSpaceOptions: GovernanceSpaceOption[];
  sidebar: React.ReactNode;
};

const GovernanceHomeChromeContext = React.createContext<GovernanceHomeChrome | null>(null);

export function GovernanceHomeChromeProvider({
  editorSpaceOptions,
  myProposalSpaceOptions,
  sidebar,
  children,
}: GovernanceHomeChrome & { children: React.ReactNode }) {
  const value = React.useMemo(
    () => ({ editorSpaceOptions, myProposalSpaceOptions, sidebar }),
    [editorSpaceOptions, myProposalSpaceOptions, sidebar]
  );

  return <GovernanceHomeChromeContext.Provider value={value}>{children}</GovernanceHomeChromeContext.Provider>;
}

export function useGovernanceHomeChrome(): GovernanceHomeChrome {
  const ctx = React.useContext(GovernanceHomeChromeContext);
  if (!ctx) {
    throw new Error('useGovernanceHomeChrome must be used within GovernanceHomeChromeProvider');
  }
  return ctx;
}
