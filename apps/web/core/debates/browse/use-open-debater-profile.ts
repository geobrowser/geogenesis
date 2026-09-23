'use client';

import * as React from 'react';

import type { DebateParticipant } from '~/core/debates/api';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { useSpace } from '~/core/hooks/use-space';
import { getSpaceSubtopicRootEntityId } from '~/core/utils/space/spaces';

import type { EntitySidePanelTarget } from '~/atoms';

type PendingProfileOpen = {
  profileSpaceId: string;
  requestToken: symbol;
  sidePanelTarget: EntitySidePanelTarget | null;
};

// Debates render this hook once per participant surface, while the side panel is shared. Coordinate
// those instances so a slow profile query cannot replace a newer click from another instance.
let latestProfileOpenRequest: symbol | null = null;

/**
 * Opens a debater's personal space in the side panel.
 *
 * A personal space's own id resolves to its "system entity" — an ugly technical record. The space's
 * topic entity is the real profile, so that is what opens. Older personal spaces without an explicit
 * topic use their page entity, which is also what the personal-space route renders as the profile.
 *
 * Two surfaces name a debater over the video: the row in the corner of their own tile, and the
 * header of every claim card. Both are the same link to the same person, so both ask here — a rule
 * decided twice is a rule that will eventually disagree with itself.
 */
export function useOpenDebaterProfile(participant: Pick<DebateParticipant, 'profile_space_id'> | null | undefined) {
  const { openSidePanel, sidePanelTarget } = useEntitySidePanel();
  const profileSpaceId = participant?.profile_space_id;
  const { space } = useSpace(profileSpaceId);
  // Prefer the declared topic even when its nested entity failed to decode and `space.entity` fell
  // back to the page. Never fall back to the space id: that id is the system entity, not the person.
  const profileEntityId = space ? getSpaceSubtopicRootEntityId(space) : null;
  const pendingProfileOpenRef = React.useRef<PendingProfileOpen | null>(null);

  const openResolvedProfile = React.useCallback(() => {
    if (!profileSpaceId || !profileEntityId) return;
    openSidePanel(profileEntityId, profileSpaceId, false, { forceRequestedSpace: true });
  }, [openSidePanel, profileEntityId, profileSpaceId]);

  React.useEffect(() => {
    const pendingProfileOpen = pendingProfileOpenRef.current;
    if (!pendingProfileOpen) return;

    if (
      pendingProfileOpen.profileSpaceId !== profileSpaceId ||
      pendingProfileOpen.sidePanelTarget !== sidePanelTarget
    ) {
      pendingProfileOpenRef.current = null;
      return;
    }
    if (!profileEntityId) return;

    pendingProfileOpenRef.current = null;
    if (pendingProfileOpen.requestToken !== latestProfileOpenRequest) return;
    openResolvedProfile();
  }, [openResolvedProfile, profileEntityId, profileSpaceId, sidePanelTarget]);

  return React.useCallback(
    (event: React.MouseEvent) => {
      // The video behind is one large play/pause button.
      event.stopPropagation();
      if (!profileSpaceId) return;

      const requestToken = Symbol('debater-profile-open');
      latestProfileOpenRequest = requestToken;
      pendingProfileOpenRef.current = null;
      if (!profileEntityId) {
        // Remember an early click and finish it after the space query resolves. Opening the space
        // id immediately would be quicker, but it is the system entity rather than the profile.
        pendingProfileOpenRef.current = { profileSpaceId, requestToken, sidePanelTarget };
        return;
      }
      openResolvedProfile();
    },
    [openResolvedProfile, profileEntityId, profileSpaceId, sidePanelTarget]
  );
}
