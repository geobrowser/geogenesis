'use client';

import { useEffect } from 'react';

import { refetch } from './server-actions';

export function Refetch() {
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return null;
}
