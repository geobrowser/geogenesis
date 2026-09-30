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

/**
 * {@link useEffectOnce}, held until `ready`: runs on the first render where it is true, and never
 * again for this mount. For work that has to wait on data but must not repeat when that data
 * refetches, such as recording that something was seen. `effect` is read when it runs, so an
 * inline closure sees that render's values.
 */
export const useEffectOnceWhen = (ready: boolean, effect: () => void): void => {
  const hasRun = useRef(false);
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    if (!ready || hasRun.current) return;
    hasRun.current = true;
    effectRef.current();
  }, [ready]);
};
