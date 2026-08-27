'use client';

import * as React from 'react';

import type { AnimationDefinition } from 'framer-motion';

export function useEnterAnimationSettled(isActive: boolean) {
  const [settled, setSettled] = React.useState(false);

  React.useEffect(() => {
    if (!isActive) setSettled(false);
  }, [isActive]);

  const onEnterAnimationComplete = React.useCallback(
    (definition: AnimationDefinition) => {
      if (definition === 'visible' && isActive) setSettled(true);
    },
    [isActive]
  );

  return { settled, onEnterAnimationComplete };
}
