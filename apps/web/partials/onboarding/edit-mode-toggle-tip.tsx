'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { editModeToggleTipDismissedAtom } from '~/atoms/product-onboarding';
import { normalizeSpaceId } from '~/core/access/space-access';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { useOnboarding } from '~/core/hooks/use-onboarding';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSpaceId } from '~/core/hooks/use-space-id';

import { SpotlightTip } from './spotlight-tip';

const TIP_NUDGE_RIGHT_PX = 12;

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

type EditModeToggleTipProps = {
  open: boolean;
  dismiss: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

export function EditModeToggleTip({ open, dismiss, anchorRef }: EditModeToggleTipProps) {
  return (
    <SpotlightTip
      open={open}
      onDismiss={dismiss}
      anchorRef={anchorRef}
      placement="below"
      width={168}
      tipId="edit-mode-tip"
      zLayer="navbar"
      nudgeRightPx={TIP_NUDGE_RIGHT_PX}
      arrowCentered
    >
      Swap between edit & browse mode
    </SpotlightTip>
  );
}
