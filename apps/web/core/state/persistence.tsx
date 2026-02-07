'use client';

import * as React from 'react';

import { persistenceEngine } from '~/core/sync/use-sync-engine';

export const Persistence = () => {
  React.useEffect(() => {
    persistenceEngine.restore();
  }, []);

  return null;
};
