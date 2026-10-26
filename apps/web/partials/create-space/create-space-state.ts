import { atom, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import type { VotingSettingsInput } from '~/core/hooks/use-deploy-space';
import type { SpaceGovernanceType, SpaceType } from '~/core/types';

// The dialog's state and its opener, apart from the dialog itself: the navbar and the entity-create
// actions only need to open it, and importing it from the dialog module pulled the whole form into
// the startup bundle.

export const spaceTypeAtom = atom<SpaceType | null>('default');
export const governanceTypeAtom = atom<SpaceGovernanceType | null>('DAO');
export const nameAtom = atom<string>('');
export const topicIdAtom = atom<string>('');
export const imageAtom = atom<string>('');
/** When non-null, overrides the deploy hook's default voting settings.
 *  Only applies to DAO governance type. Reset when the dialog closes. */
export const votingSettingsAtom = atom<VotingSettingsInput | null>(null);

export type CreateSpaceStep = 'enter-profile' | 'configure-governance' | 'create-space' | 'completed';

export const stepAtom = atom<CreateSpaceStep>('enter-profile');

const DEFAULT_SPACE_TYPE: SpaceType = 'default';
const DEFAULT_GOVERNANCE_TYPE: SpaceGovernanceType = 'DAO';

/** Externally controllable open state so non-trigger callers (e.g. the navbar
 * "+" dropdowns) can preset the atoms above and open the dialog. */
export const createSpaceDialogOpenAtom = atom<boolean>(false);

/** When true, the dialog auto-fires `createSpaces` as soon as it opens at
 * step='create-space'. Used by the claim flow to skip the profile-entry
 * step entirely. */
export const autoRunAtom = atom<boolean>(false);

// Module-level guard for the auto-run effect. A component-scoped `useRef`
// would reset on React StrictMode's intentional double-mount in dev, firing
// the deploy twice. Module scope persists across mounts; reset when the
// dialog transitions to closed.
export const createSpaceAutoRun = { fired: false };

type OpenDialogPreset = {
  name?: string;
  image?: string;
  topicId?: string;
  governanceType?: SpaceGovernanceType | null;
  spaceType?: SpaceType | null;
  step?: CreateSpaceStep;
  /** Skip the profile-entry step and fire the deploy as soon as the dialog
   * mounts. Requires `spaceType` to be set. */
  autoRun?: boolean;
};

/**
 * Opens the (globally-mounted) CreateSpaceDialog with optional preset values.
 * Without a preset, resets to the "New space" entry — the name/image form, with
 * the space type and governance fixed to the defaults above.
 */
export function useOpenCreateSpaceDialog() {
  const setName = useSetAtom(nameAtom);
  const setImage = useSetAtom(imageAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setGovernanceType = useSetAtom(governanceTypeAtom);
  const setSpaceType = useSetAtom(spaceTypeAtom);
  const setStep = useSetAtom(stepAtom);
  const setOpen = useSetAtom(createSpaceDialogOpenAtom);
  const setAutoRun = useSetAtom(autoRunAtom);
  const setVotingSettings = useSetAtom(votingSettingsAtom);

  return useCallback(
    (preset?: OpenDialogPreset) => {
      // Reset the auto-run latch so a second claim attempt on a different
      // topic (without an intervening close) doesn't silently no-op.
      createSpaceAutoRun.fired = false;
      setName(preset?.name ?? '');
      setImage(preset?.image ?? '');
      setTopicId(preset?.topicId ?? '');
      setGovernanceType(preset?.governanceType ?? DEFAULT_GOVERNANCE_TYPE);
      setSpaceType(preset?.spaceType ?? DEFAULT_SPACE_TYPE);
      setStep(preset?.step ?? 'enter-profile');
      setAutoRun(preset?.autoRun ?? false);
      // Re-opening while already open skips the close-effect cleanup, so any
      // custom voting settings from the previous session must be cleared here.
      setVotingSettings(null);
      setOpen(true);
    },
    [setName, setImage, setTopicId, setGovernanceType, setSpaceType, setStep, setOpen, setAutoRun, setVotingSettings]
  );
}
