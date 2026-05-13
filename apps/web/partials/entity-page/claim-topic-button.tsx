'use client';

import * as React from 'react';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useName } from '~/core/state/entity-page-store/entity-store';

import { Plus } from '~/design-system/icons/plus';

import { useOpenCreateSpaceDialog } from '~/partials/create-space/create-space-dialog';

type Props = {
  entityId: string;
  spaceId: string;
  /** Cover image URL on the topic entity, used as the initial cover for the new space. */
  coverUrl?: string | null;
};

export function ClaimTopicButton({ entityId, spaceId, coverUrl }: Props) {
  const name = useName(entityId, spaceId) ?? '';
  const openCreateSpaceDialog = useOpenCreateSpaceDialog();
  const { smartAccount } = useSmartAccount();

  // Hide the button entirely when the user isn't signed in — the create-space
  // dialog short-circuits to null without an address anyway, so the click
  // would do nothing.
  if (!smartAccount?.account.address) return null;

  const handleClick = () => {
    openCreateSpaceDialog({
      topicId: entityId,
      name,
      image: coverUrl ?? '',
      governanceType: 'DAO',
      // 'default' is the Blank DAO template — no presumed entity types, just SPACE +
      // PROJECT. Skips the template-picker step so the user lands directly on
      // "Space for {topic name}" with a Create Space button.
      spaceType: 'default',
      step: 'enter-profile',
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-text px-3 py-1.5 text-[14px] leading-[16px] font-medium text-white transition-opacity hover:opacity-90"
    >
      <span className="flex h-3 w-3 items-center justify-center">
        <Plus />
      </span>
      <span>Claim topic</span>
    </button>
  );
}
