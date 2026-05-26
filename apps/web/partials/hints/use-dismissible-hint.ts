'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { dismissedHintsAtom } from '~/atoms/dismissed-hints';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { useOnboarding } from '~/core/hooks/use-onboarding';

type UseDismissibleHintOptions = {
  gate: boolean;
  enterSettled?: boolean;
};

export function useDismissibleHint(hintId: string, { gate, enterSettled = true }: UseDismissibleHintOptions) {
  const hydrated = useHydrated();
  const { isOnboardingVisible } = useOnboarding();
  const [dismissedHints, setDismissedHints] = useAtom(dismissedHintsAtom);
  const dismissed = dismissedHints.includes(hintId);
  const [open, setOpen] = React.useState(false);

  const shouldOffer = hydrated && gate && !dismissed && !isOnboardingVisible;
  const readyToShow = shouldOffer && enterSettled;

  React.useEffect(() => {
    if (!readyToShow) {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [readyToShow]);

  const dismiss = React.useCallback(() => {
    setDismissedHints(prev => (prev.includes(hintId) ? prev : [...prev, hintId]));
    setOpen(false);
  }, [hintId, setDismissedHints]);

  return { open: readyToShow && open, dismiss, isActive: shouldOffer };
}
