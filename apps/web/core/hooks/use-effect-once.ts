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
 *
 * `key` makes it once per run of the same key instead, for a component reused across subjects rather
 * than remounted — a page the route moves between sessions on. It runs again whenever the key
 * changes, including back to one it ran for before: only the latest key is remembered, matching
 * state a caller keeps per subject the same way (the rematch picker re-lands a session it returns
 * to, and that is a landing to report).
 */
export const useEffectOnceWhen = (ready: boolean, effect: () => void, key?: string): void => {
  // The key it ran for, boxed so that an absent key still records that it ran.
  const ranFor = useRef<{ key: string | undefined } | null>(null);
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    if (!ready || (ranFor.current !== null && ranFor.current.key === key)) return;
    ranFor.current = { key };
    effectRef.current();
  }, [key, ready]);
};
