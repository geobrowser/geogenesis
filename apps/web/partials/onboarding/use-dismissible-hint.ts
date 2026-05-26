'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { dismissedProductOnboardingHintsAtom } from '~/atoms/product-onboarding';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { useOnboarding } from '~/core/hooks/use-onboarding';

type UseDismissibleHintOptions = {
  gate: boolean;
  settleMs?: number;
};

export function useDismissibleHint(hintId: string, { gate, settleMs = 0 }: UseDismissibleHintOptions) {
  const hydrated = useHydrated();
  const { isOnboardingVisible } = useOnboarding();
  const [dismissedHints, setDismissedHints] = useAtom(dismissedProductOnboardingHintsAtom);
  const dismissed = dismissedHints.includes(hintId);
  const [open, setOpen] = React.useState(false);

  const shouldOffer = hydrated && gate && !dismissed && !isOnboardingVisible;

  React.useEffect(() => {
    if (!shouldOffer) {
      setOpen(false);
      return;
    }
    if (settleMs === 0) {
      setOpen(true);
      return;
    }
    const timeoutId = window.setTimeout(() => setOpen(true), settleMs);
    return () => window.clearTimeout(timeoutId);
  }, [shouldOffer, settleMs]);

  const dismiss = React.useCallback(() => {
    setDismissedHints(prev => (prev.includes(hintId) ? prev : [...prev, hintId]));
    setOpen(false);
  }, [hintId, setDismissedHints]);

  return { open: shouldOffer && open, dismiss, isActive: shouldOffer };
}
