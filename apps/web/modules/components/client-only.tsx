'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';

type ClientOnlyProps = {
  children: React.ReactNode;
};

export const ClientOnly = ({ children }: ClientOnlyProps) => {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) return null;

  return <>{children}</>;
};
