'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

import { AnimatePresence, motion } from 'framer-motion';
import { useAtom } from 'jotai';

import { editModeToggleTipDismissedAtom } from '~/atoms/product-onboarding';
import { normalizeSpaceId } from '~/core/access/space-access';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { useOnboarding } from '~/core/hooks/use-onboarding';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSpaceId } from '~/core/hooks/use-space-id';

const TIP_GAP_PX = 12;
const TIP_WIDTH_PX = 168;
const TIP_NUDGE_RIGHT_PX = 12;
const VIEWPORT_PADDING_PX = 16;

const SCROLLBAR_GUTTER_PX = 20;

export function useEditModeToggleTip() {
  const hydrated = useHydrated();
  const spaceId = useSpaceId();
  const { personalSpaceId, isFetched: isPersonalSpaceFetched } = usePersonalSpaceId();
  const { canEdit, isLoading: isLoadingAccessControl } = useAccessControl(spaceId ?? '');
  const { isOnboardingVisible } = useOnboarding();
  const [dismissed, setDismissed] = useAtom(editModeToggleTipDismissedAtom);
  const [open, setOpen] = React.useState(false);

  const isPersonalSpace = Boolean(
    spaceId &&
      personalSpaceId &&
      normalizeSpaceId(spaceId) === normalizeSpaceId(personalSpaceId)
  );

  const shouldOffer =
    hydrated &&
    isPersonalSpace &&
    isPersonalSpaceFetched &&
    !dismissed &&
    !isOnboardingVisible &&
    canEdit &&
    !isLoadingAccessControl;

  React.useEffect(() => {
    if (shouldOffer) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [shouldOffer]);

  const dismiss = React.useCallback(() => {
    setDismissed(true);
    setOpen(false);
  }, [setDismissed]);

  return { open: shouldOffer && open, dismiss, isActive: shouldOffer };
}

type TipPosition = {
  top: number;
  left: number;
  arrowLeft: number;
};

function computeTipPosition(anchor: HTMLElement): TipPosition {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const maxLeft = viewportWidth - TIP_WIDTH_PX - VIEWPORT_PADDING_PX - SCROLLBAR_GUTTER_PX;

  const toggleCenterX = rect.left + rect.width / 2;

  let left = toggleCenterX - TIP_WIDTH_PX / 2 + TIP_NUDGE_RIGHT_PX;
  left = Math.max(VIEWPORT_PADDING_PX, Math.min(left, maxLeft));

  return {
    top: rect.bottom + TIP_GAP_PX,
    left,
    arrowLeft: TIP_WIDTH_PX / 2,
  };
}

type EditModeToggleTipProps = {
  open: boolean;
  dismiss: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

export function EditModeToggleTip({ open, dismiss, anchorRef }: EditModeToggleTipProps) {
  const [position, setPosition] = React.useState<TipPosition | null>(null);

  const updatePosition = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    setPosition(computeTipPosition(anchor));
  }, [anchorRef]);

  React.useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && position ? (
        <>
          <motion.div
            key="edit-mode-tip-backdrop"
            className="pointer-events-none fixed inset-0 z-1000 bg-text/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            aria-hidden
          />
          <motion.div
            key="edit-mode-tip"
            role="dialog"
            aria-labelledby="edit-mode-toggle-tip-title"
            className="pointer-events-auto fixed z-1001"
            style={{ top: position.top, left: position.left, width: TIP_WIDTH_PX }}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ type: 'spring', duration: 0.2, bounce: 0 }}
          >
            <motion.div className="relative overflow-visible rounded-lg border border-grey-02 bg-white p-2 shadow-lg">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-0.5 size-3 rotate-45 border-t border-l border-grey-02 bg-white"
                style={{ left: position.arrowLeft, transform: 'translateX(-50%)' }}
              />
              <div className="rounded-lg bg-grey-01 px-3 pt-3 pb-4">
                <p id="edit-mode-toggle-tip-title" className="text-center text-button font-medium text-text">
                  Swap between edit & browse mode
                </p>
                <button
                  type="button"
                  onClick={dismiss}
                  className="mt-3 mx-auto block rounded border border-grey-02 bg-white px-5 py-1.5 text-button font-medium text-text shadow-button transition hover:border-text hover:bg-bg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-04"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
