'use client';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useFeatureFlag } from '~/core/state/feature-flags';
import { LivePostTemplateView } from '~/core/templates/views';

import { AutomaticModeToggle } from '~/partials/entity-page/automatic-mode-toggle';

export function PostEntityPageBody({
  entityId,
  spaceId,
  serverCoverUrl,
  legacyBody,
}: {
  entityId: string;
  spaceId: string;
  serverCoverUrl: string | null;
  legacyBody: React.ReactNode;
}) {
  const enableV2Templates = useFeatureFlag('entityTemplatesV2');
  const isEditing = useUserIsEditing(spaceId);

  if (enableV2Templates && !isEditing) {
    return (
      <>
        <AutomaticModeToggle />
        <LivePostTemplateView entityId={entityId} spaceId={spaceId} serverCoverUrl={serverCoverUrl} />
      </>
    );
  }

  return <>{legacyBody}</>;
}
