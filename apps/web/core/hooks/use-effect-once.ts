'use client';

import { useEffect, useRef } from 'react';
import type { EffectCallback } from 'react';

export const useEffectOnce = (effect: EffectCallback): void => {
  const hasRun = useRef(false);

  useEffect(() => {
    if (!hasRun.current) {
      hasRun.current = true;
      return effect();
    }
    // Running once is the whole point of the hook, so `effect` is deliberately not a dependency;
    // the ref guards a StrictMode double-invoke. Naming it would make this `useEffect`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
