'use client';

import { atom, useAtomValue } from 'jotai';

import type { VotingSettingsInput } from '~/core/hooks/use-deploy-space';
import type { SpaceGovernanceType, SpaceType } from '~/core/types';

/**
 * Optimistic create-space state (DAO / company / etc. — the "+ New space" flow,
 * distinct from first-login onboarding in `pending-personal-space.ts`).
 *
 * The deploy chain blocks for a long time (IPFS publish + on-chain factory tx +
 * receipt + up to ~120s `waitForSpaceIndexed`). Rather than trap the user behind
 * the modal for that whole window, the dialog snapshots the deploy args here and
 * closes immediately; `PendingCreatedSpaceRunner` runs the chain in the
 * background and routes the user into the space once it's actually indexed (the
 * space page `notFound()`s before then, so we can't navigate early).
 *
 * NOTE: deliberately NOT persisted (plain in-memory atom). Unlike personal-space
 * creation, DAO deploy is NOT idempotent — re-running it mints a *second* space.
 * So a mid-flight reload must drop the job rather than auto-resume and
 * double-submit; the already-submitted tx still lands and shows up in the user's
 * spaces list.
 */
export type PendingCreatedSpace = {
  /** Dedupe key so the runner never fires the same deploy twice. */
  jobId: string;
  type: SpaceType;
  spaceName: string;
  spaceImage?: string;
  governanceType?: SpaceGovernanceType;
  topicId?: string;
  votingSettings?: VotingSettingsInput;
  /**
   * Smart-account address that started the deploy. The atom is global, so if the
   * wallet switches without a logout cleanup the runner uses this to drop a
   * record belonging to a different account rather than deploy against it.
   */
  address: string;
  status: 'pending' | 'failed';
};

export const pendingCreatedSpaceAtom = atom<PendingCreatedSpace | null>(null);

export function usePendingCreatedSpace() {
  const pending = useAtomValue(pendingCreatedSpaceAtom);
  return {
    isPending: pending?.status === 'pending',
    spaceName: pending?.spaceName ?? null,
  };
}
