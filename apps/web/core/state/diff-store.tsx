'use client';

import * as React from 'react';
import { createContext, useContext, useState } from 'react';

type DiffState = {
  isReviewOpen: boolean;
  setIsReviewOpen: (value: boolean) => void;
  activeSpace: string;
  setActiveSpace: (value: string) => void;
  isReadyToPublish: boolean;
  setIsReadyToPublish: (value: boolean) => void;
  selectedVersion: string;
  setSelectedVersion: (value: string) => void;
  previousVersion: string;
  setPreviousVersion: (value: string) => void;
  selectedProposal: string;
  setSelectedProposal: (value: string) => void;
  previousProposal: string;
  setPreviousProposal: (value: string) => void;
};

const initialDiffState = {
  isReviewOpen: false,
  setIsReviewOpen: (value: boolean) => null,
  activeSpace: '',
  setActiveSpace: (value: string) => null,
  isReadyToPublish: false,
  setIsReadyToPublish: (value: boolean) => null,
  selectedVersion: '',
  setSelectedVersion: (value: string) => null,
  previousVersion: '',
  setPreviousVersion: (value: string) => null,
  selectedProposal: '',
  setSelectedProposal: (value: string) => null,
  previousProposal: '',
  setPreviousProposal: (value: string) => null,
};

const DiffContext = createContext<DiffState>(initialDiffState);

type DiffProviderProps = {
  children: React.ReactNode;
};

export const DiffProvider = ({ children }: DiffProviderProps) => {
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const [activeSpace, setActiveSpace] = useState<string>('');
  const [isReadyToPublish, setIsReadyToPublish] = useState<boolean>(false);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [previousVersion, setPreviousVersion] = useState<string>('');
  const [selectedProposal, setSelectedProposal] = useState<string>('');
  const [previousProposal, setPreviousProposal] = useState<string>('');

  return (
    <DiffContext.Provider
      value={{
        isReviewOpen,
        setIsReviewOpen,
        activeSpace,
        setActiveSpace,
        isReadyToPublish,
        setIsReadyToPublish,
        selectedVersion,
        setSelectedVersion,
        previousVersion,
        setPreviousVersion,
        selectedProposal,
        setSelectedProposal,
        previousProposal,
        setPreviousProposal,
      }}
    >
      {children}
    </DiffContext.Provider>
  );
};

export const useDiff = () => {
  const value = useContext(DiffContext);

  if (!value) {
    throw new Error(`Missing DiffProvider`);
  }

  return value;
};
