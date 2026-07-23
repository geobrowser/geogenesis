'use client';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useDebatesEnabled } from '~/core/state/feature-flags';

import { DebatesBrowseFeed } from './debate-feed';

type DebateEntityViewProps = {
  spaceId: string;
  /** The Debate entity id — anchors the feed to this debate (matched against the geo-chat debate id). */
  debateId: string;
  /** The normal entity page, rendered on the server and shown only in edit mode. */
  editView: React.ReactNode;
};

/**
 * A published Debate is a live video, not a wall of values. In browse mode we drop the visitor
 * straight into the `/debates` infinite-scroll feed anchored to this debate; the raw entity page
 * (props, relations, blocks) is only for editors and shows up when edit mode is on. If the debates
 * feature is off we fall back to the entity page so nothing is ever hidden without a way to see it.
 */
export function DebateEntityView({ spaceId, debateId, editView }: DebateEntityViewProps) {
  const isEditing = useUserIsEditing(spaceId);
  const debatesEnabled = useDebatesEnabled();

  if (isEditing || !debatesEnabled) {
    return <>{editView}</>;
  }

  // Browse mode shows the live video, but if this debate isn't watchable in the space's feed we
  // fall back to the entity page rather than the feed's "space not found" error.
  return <DebatesBrowseFeed spaceId={spaceId} initialDebateId={debateId} fallback={editView} />;
}
