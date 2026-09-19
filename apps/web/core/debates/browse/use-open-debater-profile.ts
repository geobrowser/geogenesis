'use client';

import * as React from 'react';

import type { DebateParticipant } from '~/core/debates/api';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { useSpace } from '~/core/hooks/use-space';

/**
 * Opens a debater's personal space in the side panel.
 *
 * A personal space's own id resolves to its "system entity" — an ugly technical record. The space's
 * page entity is the real profile, so that is what opens, falling back to the space id while it is
 * still being fetched.
 *
 * Two surfaces name a debater over the video: the row in the corner of their own tile, and the
 * header of every claim card. Both are the same link to the same person, so both ask here — a rule
 * decided twice is a rule that will eventually disagree with itself.
 */
export function useOpenDebaterProfile(participant: Pick<DebateParticipant, 'profile_space_id'> | null | undefined) {
  const { openSidePanel } = useEntitySidePanel();
  const { space } = useSpace(participant?.profile_space_id);
  const profileEntityId = space?.entity.id || participant?.profile_space_id;

  return React.useCallback(
    (event: React.MouseEvent) => {
      // The video behind is one large play/pause button.
      event.stopPropagation();
      if (participant && profileEntityId) openSidePanel(profileEntityId, participant.profile_space_id, false);
    },
    [openSidePanel, participant, profileEntityId]
  );
}
