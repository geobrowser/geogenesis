'use client';

import * as React from 'react';
import { useState } from 'react';

import { useEffectOnce } from '~/core/hooks/use-effect-once';

type ClientOnlyProps = {
  children: React.ReactNode;
};

export const ClientOnly = ({ children }: ClientOnlyProps) => {
  const [hasMounted, setHasMounted] = useState(false);

  useEffectOnce(() => {
    setHasMounted(true);
  });

  if (!hasMounted) return null;

  return <>{children}</>;
};
