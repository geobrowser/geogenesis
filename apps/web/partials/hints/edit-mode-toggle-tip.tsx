'use client';

import * as React from 'react';

import { HINT_IDS } from '~/atoms/dismissed-hints';
import { normalizeSpaceId } from '~/core/access/space-access';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSpaceId } from '~/core/hooks/use-space-id';

import { SpotlightTip } from './spotlight-tip';
import { useDismissibleHint } from './use-dismissible-hint';

const TIP_NUDGE_RIGHT_PX = 12;

export function useEditModeToggleTip() {
  const spaceId = useSpaceId();
  const { personalSpaceId, isFetched: isPersonalSpaceFetched } = usePersonalSpaceId();
  const { canEdit, isLoading: isLoadingAccessControl } = useAccessControl(spaceId ?? '');

  const isPersonalSpace = Boolean(
    spaceId &&
      personalSpaceId &&
      normalizeSpaceId(spaceId) === normalizeSpaceId(personalSpaceId)
  );

  const gate = isPersonalSpace && isPersonalSpaceFetched && canEdit && !isLoadingAccessControl;

  return useDismissibleHint(HINT_IDS.editModeToggle, { gate });
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
