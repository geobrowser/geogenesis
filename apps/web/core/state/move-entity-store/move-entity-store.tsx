'use client';

import * as React from 'react';
import { createContext, useContext, useState } from 'react';

type MoveEntityState = {
  isMoveReviewOpen: boolean;
  setIsMoveReviewOpen: (value: boolean) => void;
  spaceIdFrom: string;
  setSpaceIdFrom: (value: string) => void;
  spaceIdTo: string;
  setSpaceIdTo: (value: string) => void;
  entityId: string;
  setEntityId: (value: string) => void;
};

const MoveEntityContext = createContext<MoveEntityState | null>(null);

type MoveEntityProviderProps = {
  children: React.ReactNode;
};

export const MoveEntityProvider = ({ children }: MoveEntityProviderProps) => {
  const [isMoveReviewOpen, setIsMoveReviewOpen] = useState<boolean>(false);
  const [entityId, setEntityId] = useState<string>('');
  const [spaceIdFrom, setSpaceIdFrom] = useState<string>('');
  const [spaceIdTo, setSpaceIdTo] = useState<string>('');

  return (
    <MoveEntityContext.Provider
      value={{
        isMoveReviewOpen,
        setIsMoveReviewOpen,
        entityId,
        setEntityId,
        spaceIdFrom,
        setSpaceIdFrom,
        spaceIdTo,
        setSpaceIdTo,
      }}
    >
      {children}
    </MoveEntityContext.Provider>
  );
};

export const useMoveEntity = () => {
  const value = useContext(MoveEntityContext);

  if (!value) {
    throw new Error('useMoveEntity must be used within a MoveEntityProvider');
  }
  return value;
};
