'use client';

import * as React from 'react';

import { ErrorBoundary } from 'react-error-boundary';

import { reportBoundaryError } from './logger';

type Props = {
  fallback: React.ReactElement | null;
  children: React.ReactNode;
};

export function TrackedErrorBoundary({ fallback, children }: Props) {
  return (
    <ErrorBoundary fallback={fallback} onError={reportBoundaryError}>
      {children}
    </ErrorBoundary>
  );
}
