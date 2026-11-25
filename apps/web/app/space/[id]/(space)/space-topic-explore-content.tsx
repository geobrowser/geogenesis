'use client';

import * as React from 'react';

import { useFeatureFlag } from '~/core/state/feature-flags';
import { LiveTopicTemplateView } from '~/core/templates/views/live-topic-template-view';
import { SpaceTopicFeed } from '~/core/topics/browse/topic-feed';

/**
 * Explore body for a Topic-typed Space (`/space/[id]`).
 *
 * When `entityTemplatesV2` is enabled, renders our redesigned `TopicTemplate` embedded directly
 * inside the Space shell (preserving the Space header, Members/Editors, Governance tabs, and right
 * rail while avoiding duplicate cover/H1 chrome). Falls back to `SpaceTopicFeed` when disabled.
 */
export function SpaceTopicExploreContent({ spaceId, spaceTopicId }: { spaceId: string; spaceTopicId: string }) {
  const enableV2Templates = useFeatureFlag('entityTemplatesV2');

  if (enableV2Templates) {
    return <LiveTopicTemplateView entityId={spaceTopicId} spaceId={spaceId} embedded />;
  }

  return <SpaceTopicFeed spaceId={spaceId} spaceTopicId={spaceTopicId} />;
}
