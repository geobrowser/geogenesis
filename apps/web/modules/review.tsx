import * as React from 'react';
import { useState, useCallback, createContext, useContext } from 'react';

type ReviewState = {
  isReviewOpen: boolean;
  setIsReviewOpen: (value: boolean) => void;
  toggleIsReviewOpen: () => void;
  activeSpace: string;
  setActiveSpace: (value: string) => void;
  isReadyToPublish: boolean;
  setIsReadyToPublish: (value: boolean) => void;
};

const initialReviewState = {
  isReviewOpen: false,
  setIsReviewOpen: (value: boolean) => null,
  toggleIsReviewOpen: () => null,
  activeSpace: '',
  setActiveSpace: (value: string) => null,
  isReadyToPublish: false,
  setIsReadyToPublish: (value: boolean) => null,
};

const ReviewContext = createContext<ReviewState>(initialReviewState);

type ReviewProviderProps = {
  children: React.ReactNode;
};

export const ReviewProvider = ({ children }: ReviewProviderProps) => {
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);

  const toggleIsReviewOpen = useCallback(() => {
    setIsReviewOpen(!isReviewOpen);
  }, [isReviewOpen]);

  const [activeSpace, setActiveSpace] = useState<string>('');

  const [isReadyToPublish, setIsReadyToPublish] = useState<boolean>(false);

  return (
    <ReviewContext.Provider
      value={{
        ...initialReviewState,
        isReviewOpen,
        setIsReviewOpen,
        toggleIsReviewOpen,
        activeSpace,
        setActiveSpace,
        isReadyToPublish,
        setIsReadyToPublish,
      }}
    >
      {children}
    </ReviewContext.Provider>
  );
};

export const useReview = () => {
  const value = useContext(ReviewContext);

  if (!value) {
    throw new Error(`Missing ReviewProvider`);
  }

  return value;
};
