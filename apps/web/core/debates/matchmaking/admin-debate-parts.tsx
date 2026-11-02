'use client';

import * as React from 'react';

import cx from 'classnames';

import { Avatar } from '~/design-system/avatar';

import { firstName } from '~/partials/profile/claim-response-tag';

import type { DebateParticipantSummary } from '../api';

/**
 * Text on the admin calendar's state fills, darkened from `green`, `orange` and `red-01` so it reads
 * on its own tint. One place for them, since the blocks, the answer pills and New match all use them.
 */
export const POSITIVE_TEXT_CLASS = 'text-[#0b7a59]';
export const WAITING_TEXT_CLASS = 'text-[#a45a00]';
export const NEGATIVE_TEXT_CLASS = 'text-[#c62f19]';

/** A debater's first name, or "Someone" while the graph has not named them: never a bare space id. */
export function debaterFirstName(summary: Pick<DebateParticipantSummary, 'display_name'> | null | undefined) {
  return firstName(summary?.display_name) ?? 'Someone';
}

/** A debater's face at a fixed size. An image avatar fills its parent, so the box sets the size. */
export function DebaterFace({
  summary,
  fallbackId,
  size,
}: {
  summary: Pick<DebateParticipantSummary, 'avatar_cid' | 'profile_space_id'> | null;
  /** Seeds the generated avatar when there is no profile to seed it from. */
  fallbackId: string;
  size: 28 | 32;
}) {
  return (
    <div className={cx('shrink-0 overflow-hidden rounded-full', size === 28 ? 'h-7 w-7' : 'h-8 w-8')}>
      <Avatar avatarUrl={summary?.avatar_cid ?? null} value={summary?.profile_space_id ?? fallbackId} size={size} />
    </div>
  );
}
