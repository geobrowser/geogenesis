import * as React from 'react';
import { useState, createContext, useContext } from 'react';

type DiffState = {
  isReviewOpen: boolean;
  setIsReviewOpen: (value: boolean) => void;
  activeSpace: string;
  setActiveSpace: (value: string) => void;
  isReadyToPublish: boolean;
  setIsReadyToPublish: (value: boolean) => void;
  isCompareOpen: boolean;
  setIsCompareOpen: (value: boolean) => void;
  activeEntity: string;
  setActiveEntity: (value: string) => void;
  selectedVersion: string;
  setSelectedVersion: (value: string) => void;
  previousVersion: string;
  setPreviousVersion: (value: string) => void;
};

const initialDiffState = {
  isReviewOpen: false,
  setIsReviewOpen: (value: boolean) => null,
  activeSpace: '',
  setActiveSpace: (value: string) => null,
  isReadyToPublish: false,
  setIsReadyToPublish: (value: boolean) => null,
  isCompareOpen: false,
  setIsCompareOpen: (value: boolean) => null,
  activeEntity: '',
  setActiveEntity: (value: string) => null,
  selectedVersion: '',
  setSelectedVersion: (value: string) => null,
  previousVersion: '',
  setPreviousVersion: (value: string) => null,
};

const DiffContext = createContext<DiffState>(initialDiffState);

type DiffProviderProps = {
  children: React.ReactNode;
};

export const DiffProvider = ({ children }: DiffProviderProps) => {
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const [activeSpace, setActiveSpace] = useState<string>('');
  const [isReadyToPublish, setIsReadyToPublish] = useState<boolean>(false);
  const [isCompareOpen, setIsCompareOpen] = useState<boolean>(false);
  const [activeEntity, setActiveEntity] = useState<string>('');
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [previousVersion, setPreviousVersion] = useState<string>('');

  return (
    <DiffContext.Provider
      value={{
        isReviewOpen,
        setIsReviewOpen,
        activeSpace,
        setActiveSpace,
        isReadyToPublish,
        setIsReadyToPublish,
        isCompareOpen,
        setIsCompareOpen,
        activeEntity,
        setActiveEntity,
        selectedVersion,
        setSelectedVersion,
        previousVersion,
        setPreviousVersion,
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
