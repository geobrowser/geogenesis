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
    // Guard against firing before the entity store hydrates — the auto-run
    // path requires non-empty name + topicId too, but failing the click
    // explicitly gives the user a clearer signal (no silent no-op).
    if (!name) return;

    openCreateSpaceDialog({
      topicId: entityId,
      name,
      image: coverUrl ?? '',
      governanceType: 'DAO',
      // 'default' is the Blank DAO template — no presumed entity types, just
      // SPACE + PROJECT. Combined with step='create-space' + autoRun, the
      // dialog fires the deploy immediately on open, skipping both the
      // template picker and the profile-entry confirmation.
      spaceType: 'default',
      step: 'create-space',
      autoRun: true,
      // Replicate this topic's content (values + relations + blocks) into the
      // new space's home page entity — same flow as "Clone to new space" in
      // the entity-page context menu.
      cloneFromEntity: { entityId, sourceSpaceId: spaceId },
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!name}
      aria-disabled={!name}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-text px-3 py-1.5 text-[14px] leading-[16px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex h-3 w-3 items-center justify-center">
        <Plus />
      </span>
      <span>Claim topic</span>
    </button>
  );
}
