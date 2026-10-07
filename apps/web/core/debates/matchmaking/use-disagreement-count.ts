import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

import { useParticipantPositions } from '../participant-positions';
import { analyzeMatchingClaims } from './disagreement-counts';
import { isPersonId } from './person-records-document';

/**
 * How many claims the viewer and one other person disagree on, for a surface that has only that
 * person rather than the People tab's roster — a shared availability link.
 *
 * The same read and the same comparison the People tab runs for its rows, narrowed to the pair, so
 * the number here and the row's "N matches" cannot come out different.
 *
 * `null` until it is known: signed out, either id not a person, still loading, or failed.
 */
export function useDisagreementCount(viewerProfileSpaceId: string | null, peerProfileSpaceId: string | null) {
  const viewer = viewerProfileSpaceId && isPersonId(viewerProfileSpaceId) ? viewerProfileSpaceId : null;
  const peer =
    peerProfileSpaceId && isPersonId(peerProfileSpaceId) && (!viewer || normId(peerProfileSpaceId) !== normId(viewer))
      ? peerProfileSpaceId
      : null;
  const participants = React.useMemo(
    () => (viewer && peer ? [{ profile_space_id: viewer }, { profile_space_id: peer }] : []),
    [viewer, peer]
  );
  const { byClaim, isLoading, isPlaceholderData, error } = useParticipantPositions(participants, viewer, {
    onlyViewerClaims: true,
  });

  return React.useMemo(() => {
    if (!viewer || !peer || isLoading || isPlaceholderData || error !== null) return null;
    return analyzeMatchingClaims(byClaim, viewer).byProfile.get(normId(peer))?.length ?? 0;
  }, [byClaim, error, isLoading, isPlaceholderData, peer, viewer]);
}
