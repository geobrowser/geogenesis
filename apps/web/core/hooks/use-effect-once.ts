/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from 'react';
import type { EffectCallback } from 'react';

export const useEffectOnce = (effect: EffectCallback): void => {
  const hasRun = useRef(false);

  useEffect(() => {
    if (!hasRun.current) {
      hasRun.current = true;
      return effect();
    }
  }, []);
};
