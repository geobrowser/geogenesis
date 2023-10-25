'use client';

import * as React from 'react';
import { createContext, useContext, useState } from 'react';

type MergeEntityState = {
  isMergeReviewOpen: boolean;
  setIsMergeReviewOpen: (value: boolean) => void;
  entityIdOne: string;
  setEntityIdOne: (value: string) => void;
  entityIdTwo: string;
  setEntityIdTwo: (value: string) => void;
};

const initialMergeEntityState = {
  isMergeReviewOpen: false,
  setIsMergeReviewOpen: (value: boolean) => null,
  entityIdOne: '',
  setEntityIdOne: (value: string) => null,
  entityIdTwo: '',
  setEntityIdTwo: (value: string) => null,
};

const MergeEntityContext = createContext<MergeEntityState>(initialMergeEntityState);

type MergeEntityProviderProps = {
  children: React.ReactNode;
};

export const MergeEntityProvider = ({ children }: MergeEntityProviderProps) => {
  const [isMergeReviewOpen, setIsMergeReviewOpen] = useState<boolean>(false);
  const [entityIdOne, setEntityIdOne] = useState<string>('');
  const [entityIdTwo, setEntityIdTwo] = useState<string>('');
  return (
    <MergeEntityContext.Provider
      value={{
        isMergeReviewOpen,
        setIsMergeReviewOpen,
        entityIdOne,
        setEntityIdOne,
        entityIdTwo,
        setEntityIdTwo,
      }}
    >
      {children}
    </MergeEntityContext.Provider>
  );
};

export const useMergeEntity = () => {
  const value = useContext(MergeEntityContext);

  if (!value) {
    throw new Error('useMergeEntity must be used within a MergeEntityProvider');
  }
  return value;
};
