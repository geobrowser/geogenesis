'use client';

import { Ipfs } from '@geoprotocol/geo-sdk/lite';
import * as Dialog from '@radix-ui/react-dialog';

import * as React from 'react';
import { ChangeEvent, useCallback, useRef } from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useRouter } from 'next/navigation';

import { type VotingSettingsInput } from '~/core/hooks/use-deploy-space';
import { useImageWithFallback } from '~/core/hooks/use-image-with-fallback';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { pendingCreatedSpaceAtom } from '~/core/state/pending-created-space';
import { SpaceGovernanceType, SpaceType } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { FindEntity } from '~/design-system/find-entity';
import { Close } from '~/design-system/icons/close';
import { CloseSmall } from '~/design-system/icons/close-small';
import { QuestionCircle } from '~/design-system/icons/question-circle';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';
import { Tooltip } from '~/design-system/tooltip';

import { Animation } from '~/partials/onboarding/dialog';
import {
  DEFAULT_VOTING_SETTINGS_SNAPSHOT,
  type VotingSettingsFormState,
  parseVotingSettingsForm,
  snapshotToFormState,
  snapshotToHidden,
  votingSettingsInputToSnapshot,
  votingSettingsWarnings,
} from '~/partials/governance/voting-settings';
import { VotingSettingsFields } from '~/partials/governance/voting-settings-fields';

export const spaceTypeAtom = atom<SpaceType | null>(null);
export const governanceTypeAtom = atom<SpaceGovernanceType | null>(null);
export const nameAtom = atom<string>('');
export const topicIdAtom = atom<string>('');
export const imageAtom = atom<string>('');
/** When non-null, overrides the deploy hook's default voting settings.
 *  Only applies to DAO governance type. Reset when the dialog closes. */
export const votingSettingsAtom = atom<VotingSettingsInput | null>(null);
const spaceIdAtom = atom<string>('');

type Step = 'select-type' | 'enter-profile' | 'configure-governance' | 'create-space' | 'completed';

export const stepAtom = atom<Step>('select-type');

/** Externally controllable open state so non-trigger callers (e.g. the navbar
 * "+" dropdowns) can preset the atoms above and open the dialog. */
export const createSpaceDialogOpenAtom = atom<boolean>(false);

/** When true, the dialog auto-fires `createSpaces` as soon as it opens at
 * step='create-space'. Used by the claim flow to skip the template-picker
 * and profile-entry steps entirely. */
const autoRunAtom = atom<boolean>(false);

const workflowSteps: Array<Step> = ['create-space', 'completed'];

// Module-level guard for the auto-run effect. A component-scoped `useRef`
// would reset on React StrictMode's intentional double-mount in dev, firing
// the deploy twice. Module scope persists across mounts; reset when the
// dialog transitions to closed.
let autoRunFired = false;

type OpenDialogPreset = {
  name?: string;
  image?: string;
  topicId?: string;
  governanceType?: SpaceGovernanceType | null;
  spaceType?: SpaceType | null;
  step?: Step;
  /** Skip the template-picker / profile-entry steps and fire the deploy as
   * soon as the dialog mounts. Requires `spaceType` to be set. */
  autoRun?: boolean;
};

/**
 * Opens the (globally-mounted) CreateSpaceDialog with optional preset values.
 * Without a preset, resets to the original "New space" entry — same behavior the
 * navbar dropdown trigger had before this was hoisted to a global mount.
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
      autoRunFired = false;
      setName(preset?.name ?? '');
      setImage(preset?.image ?? '');
      setTopicId(preset?.topicId ?? '');
      setGovernanceType(preset?.governanceType ?? null);
      setSpaceType(preset?.spaceType ?? null);
      setStep(preset?.step ?? 'select-type');
      setAutoRun(preset?.autoRun ?? false);
      // Re-opening while already open skips the close-effect cleanup, so any
      // custom voting settings from the previous session must be cleared here.
      setVotingSettings(null);
      setOpen(true);
    },
    [setName, setImage, setTopicId, setGovernanceType, setSpaceType, setStep, setOpen, setAutoRun, setVotingSettings]
  );
}

export function CreateSpaceDialog() {
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const [open, onOpenChange] = useAtom(createSpaceDialogOpenAtom);
  const setPendingCreatedSpace = useSetAtom(pendingCreatedSpaceAtom);

  const spaceType = useAtomValue(spaceTypeAtom);
  const name = useAtomValue(nameAtom);
  const topicId = useAtomValue(topicIdAtom);
  const image = useAtomValue(imageAtom);
  const governanceType = useAtomValue(governanceTypeAtom);
  const step = useAtomValue(stepAtom);
  const autoRun = useAtomValue(autoRunAtom);
  const votingSettings = useAtomValue(votingSettingsAtom);

  const setAutoRun = useSetAtom(autoRunAtom);
  const setVotingSettings = useSetAtom(votingSettingsAtom);

  // On close: clear the auto-run guard and the transient claim-flow atoms so
  // a subsequent open from a non-claim caller (navbar "+") doesn't inherit
  // stale values. The OpenDialogPreset always overwrites these on open, so
  // this is hygiene more than correctness.
  React.useEffect(() => {
    if (!open) {
      autoRunFired = false;
      setAutoRun(false);
      setVotingSettings(null);
    }
  }, [open, setAutoRun, setVotingSettings]);

  // Auto-run path: when the dialog is opened directly at 'create-space' with
  // autoRun, fire the deploy as soon as everything is in place. Guarded by a
  // module-level flag so React StrictMode's dev double-mount, re-renders, and
  // effect re-runs don't fire deploy twice. Declared above the early
  // `return null` for !address so the hook count stays stable when the user
  // signs in / out while the dialog is mounted.
  //
  // We require name + topicId to be non-empty before firing: the entity-page
  // claim button sets name via the live entity store, which can be `''` on
  // the first render before hydration completes. Without this check the
  // deploy would go out with an empty space name.
  React.useEffect(() => {
    if (!open || !autoRun) return;
    if (step !== 'create-space') return;
    if (!spaceType || !address) return;
    if (!name || !topicId) return;
    if (autoRunFired) return;
    autoRunFired = true;
    createSpaces(spaceType);
  }, [open, autoRun, step, spaceType, address, name, topicId, image, governanceType]);

  if (!address) return null;

  function createSpaces(spaceType: SpaceType) {
    if (!address || !spaceType) return;

    // Optimistic: snapshot the deploy args and hand the slow chain (IPFS publish
    // + on-chain factory tx + receipt + up to ~120s index wait) to the
    // always-mounted PendingCreatedSpaceRunner, then close the modal immediately
    // instead of blocking on it. The runner routes the user into the space once
    // it's indexed (the space page notFound()s before then), and surfaces a
    // retryable error via the status bar on failure.
    setPendingCreatedSpace({
      jobId: crypto.randomUUID(),
      type: spaceType,
      spaceName: name,
      spaceImage: image || undefined,
      governanceType: governanceType ?? undefined,
      topicId: topicId || undefined,
      votingSettings: votingSettings ?? undefined,
      address,
      status: 'pending',
    });

    onOpenChange(false);
  }

  function onRunOnboardingWorkflow() {
    if (!address || !smartAccount || !spaceType) return;
    createSpaces(spaceType);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content
          // Only allow closing the dialog by clicking the close button
          onEscapeKeyDown={e => {
            e.preventDefault();
          }}
          onPointerDownOutside={e => {
            e.preventDefault();
          }}
          onInteractOutside={e => {
            e.preventDefault();
          }}
        >
          <Dialog.Title className="sr-only">Create a new space</Dialog.Title>
          <Dialog.Description className="sr-only">
            Create a new space by selecting a template and configuring governance settings
          </Dialog.Description>
          <div className="pointer-events-none fixed inset-0 z-100 flex h-full w-full items-start justify-center bg-grey-04/50">
            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ type: 'tween', ease: 'easeInOut', duration: 0.15 }}
                className="relative z-10 flex h-full w-full items-start justify-center"
              >
                <ModalCard childKey="card">
                  <StepHeader />
                  {step === 'select-type' && <StepSelectType />}
                  {step === 'enter-profile' && <StepEnterProfile onNext={onRunOnboardingWorkflow} address={address} />}
                  {step === 'configure-governance' && <StepConfigureGovernance />}
                  {workflowSteps.includes(step) && <StepComplete onDone={() => onOpenChange(false)} />}
                </ModalCard>
              </motion.div>
            </AnimatePresence>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ModalCardProps = {
  childKey: string;
  children: React.ReactNode;
};

const ModalCard = ({ childKey, children }: ModalCardProps) => {
  return (
    <motion.div
      key={childKey}
      initial={{ opacity: 0, bottom: -5 }}
      animate={{ opacity: 1, bottom: 0 }}
      exit={{ opacity: 0, bottom: -5 }}
      transition={{ ease: 'easeInOut', duration: 0.225 }}
      className="pointer-events-auto relative z-100 mt-40 flex h-[440px] w-full max-w-[360px] flex-col overflow-hidden rounded-lg border border-grey-02 bg-white p-4 shadow-dropdown"
    >
      {children}
    </motion.div>
  );
};

const headerText: Record<Step, string> = {
  'select-type': 'Select space template',
  'enter-profile': '',
  'configure-governance': 'Advanced governance settings',
  'create-space': '',
  completed: '',
};

const StepHeader = () => {
  const [step, setStep] = useAtom(stepAtom);
  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);

  const showBack = step === 'enter-profile' || step === 'configure-governance';

  const handleBack = () => {
    if (step === 'configure-governance') {
      setStep('enter-profile');
      return;
    }
    setName('');
    setTopicId('');
    if (step === 'enter-profile') {
      setStep('select-type');
    }
  };

  return (
    <div className="relative z-20 flex items-center justify-between pb-2">
      <div className="rotate-180">
        {showBack ? (
          <SquareButton icon={<RightArrowLongSmall />} onClick={handleBack} className="border-none! bg-transparent!" />
        ) : (
          <div className="h-1 w-4" />
        )}
      </div>
      <h3 className="text-smallTitle">{headerText[step]}</h3>
      {step !== 'create-space' && step !== 'completed' && step !== 'configure-governance' ? (
        <Dialog.Close asChild>
          <SquareButton icon={<Close color="grey-04" />} className="border-none! bg-transparent!" />
        </Dialog.Close>
      ) : (
        // Render an empty span to position header text in the middle
        <div className="h-1 w-4" />
      )}
    </div>
  );
};

type StepContentsProps = {
  childKey: string;
  children: React.ReactNode;
};

const StepContents = ({ childKey, children }: StepContentsProps) => {
  return (
    <motion.div
      key={childKey}
      initial={{ opacity: 0, right: -20 }}
      animate={{ opacity: 1, left: 0, right: 0 }}
      exit={{ opacity: 0, left: -20 }}
      transition={{ ease: 'easeInOut', duration: 0.225 }}
      className="relative flex min-h-0 grow flex-col"
    >
      {children}
    </motion.div>
  );
};

function StepSelectType() {
  const setSpaceType = useSetAtom(spaceTypeAtom);
  const setGovernanceType = useSetAtom(governanceTypeAtom);
  const setStep = useSetAtom(stepAtom);

  return (
    <>
      <StepContents childKey="account-type">
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {spaceTypeOptions.map(spaceType => {
            return (
              <button
                key={spaceType.value}
                onClick={() => {
                  setSpaceType(spaceType.value);

                  if (spaceType.governance) {
                    setGovernanceType(spaceType.governance);
                  }
                  setStep('enter-profile');
                }}
                className="flex items-center gap-3 rounded-lg border border-divider bg-white py-2 pr-3 pl-2 transition-colors duration-150 ease-in-out hover:bg-divider"
              >
                <div className="size-8 shrink-0 overflow-clip rounded">
                  <img src={spaceType.image} alt="" className="block h-full w-full object-cover" />
                </div>
                <div className="text-button">{spaceType.label}</div>
              </button>
            );
          })}
        </div>
      </StepContents>
    </>
  );
}

const spaceTypeOptions: { image: string; label: string; value: SpaceType; governance?: 'DAO' | 'PERSONAL' }[] = [
  { image: '/images/onboarding/blank.png', label: 'Blank', value: 'default', governance: 'DAO' },
  {
    image: '/images/onboarding/academic-field.png',
    label: 'Academic field',
    value: 'academic-field',
    governance: 'DAO',
  },
  { image: '/images/onboarding/company.png', label: 'Company', value: 'company', governance: 'DAO' },
  { image: '/images/onboarding/dao.png', label: 'DAO', value: 'dao', governance: 'DAO' },
  {
    image: '/images/onboarding/gov-org.png',
    label: 'Government org',
    value: 'government-org',
    governance: 'DAO',
  },
  { image: '/images/onboarding/industry.png', label: 'Industry', value: 'industry', governance: 'DAO' },
  {
    image: '/images/onboarding/interest-group.png',
    label: 'Interest',
    value: 'interest',
    governance: 'DAO',
  },
  { image: '/images/onboarding/region.png', label: 'Region', value: 'region', governance: 'DAO' },
  { image: '/images/onboarding/nonprofit.png', label: 'Nonprofit', value: 'nonprofit', governance: 'DAO' },
  { image: '/images/onboarding/protocol.png', label: 'Protocol', value: 'protocol', governance: 'DAO' },
];

type StepEnterProfileProps = {
  onNext: () => void;
  address: string;
};

function StepEnterProfile({ onNext }: StepEnterProfileProps) {
  const [name, setName] = useAtom(nameAtom);
  const [topicId, setTopicId] = useAtom(topicIdAtom);
  const spaceType = useAtomValue(spaceTypeAtom);
  const isCompany = spaceType === 'company';
  const [image, setImage] = useAtom(imageAtom);
  const setStep = useSetAtom(stepAtom);
  const customVotingSettings = useAtomValue(votingSettingsAtom);

  const validName = name.length > 0;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      const { cid } = await Ipfs.uploadImage({ blob: file }, 'TESTNET', true);
      setImage(cid);
    }
  };

  const governanceType = useAtomValue(governanceTypeAtom);

  if (!governanceType) return null;

  return (
    <div className="space-y-4">
      <StepContents childKey="onboarding">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="group relative overflow-hidden rounded-lg shadow-lg">
              {isCompany ? (
                <>
                  {image ? (
                    <CreateSpaceImagePreview image={image} height={152} width={152} onRemove={() => setImage('')} />
                  ) : (
                    <img src="/images/onboarding/no-avatar.png" alt="" className="size-[152px] object-cover" />
                  )}
                </>
              ) : (
                <>
                  {image ? (
                    <CreateSpaceImagePreview image={image} height={100} width={250} onRemove={() => setImage('')} />
                  ) : (
                    <img src="/placeholder-cover.png" alt="" className="h-[100px] w-[250px] object-cover" />
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 pb-4">
            <label htmlFor="file" className="inline-block cursor-pointer text-center hover:underline">
              <SmallButton icon={<Upload />} onClick={handleFileInputClick}>
                Upload {isCompany ? 'Avatar' : 'Cover'}
              </SmallButton>
            </label>
            <input
              ref={fileInputRef}
              accept="image/png, image/jpeg"
              id="file"
              onChange={handleChange}
              type="file"
              className="hidden"
            />
          </div>
        </div>
      </StepContents>
      <div className={cx('flex w-full flex-col items-center justify-center gap-3', !isCompany && 'pt-[26px]')}>
        <div className="relative z-100 w-full">
          <div className={cx(topicId && 'invisible')}>
            <FindEntity
              onDone={entity => {
                setName(entity.name ?? '');
                setTopicId(entity.id);
              }}
              onCreateEntity={entity => {
                setName(entity.name ?? '');
                setTopicId('');
              }}
              placeholder="Space name..."
            />
          </div>
          {topicId && (
            <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-1">
              <div className="text-bodySemibold">Space for</div>
              <SmallButton
                onClick={() => {
                  setName('');
                  setTopicId('');
                }}
              >
                <span>{name}</span>
                <CloseSmall />
              </SmallButton>
            </div>
          )}
        </div>
      </div>
      <div className="absolute inset-x-4 bottom-4 flex flex-col items-stretch gap-2">
        <div className="absolute top-0 right-0 left-0 z-100 flex -translate-y-full justify-center pb-4">
          <Tooltip
            trigger={
              <div className="inline-flex cursor-pointer items-center gap-1 text-grey-04">
                <Text as="h3" variant="footnote" className="text-center">
                  {governanceText[governanceType]}
                </Text>
                <div>
                  <QuestionCircle />
                </div>
              </div>
            }
            label={governanceLabel[governanceType]}
            position="top"
          />
        </div>
        <Button disabled={!validName} onClick={onNext} className="w-full">
          Create Space
        </Button>
        {governanceType === 'DAO' && (
          <button
            type="button"
            onClick={() => setStep('configure-governance')}
            className="text-center text-metadataMedium text-grey-04 hover:text-text"
          >
            Advanced settings{customVotingSettings ? ' (customized)' : ''}
          </button>
        )}
      </div>
    </div>
  );
}

function StepConfigureGovernance() {
  const [customSettings, setCustomSettings] = useAtom(votingSettingsAtom);
  const setStep = useSetAtom(stepAtom);

  // The creator is the only initial editor, so the SDK validates flat/quorum against 1.
  const NEW_SPACE_INITIAL_EDITOR_COUNT = 1;

  // Prefill from the override atom if the user already customized settings, otherwise the
  // create-time defaults — the same source of truth used at deploy time.
  const initialSnapshot = customSettings
    ? votingSettingsInputToSnapshot(customSettings)
    : DEFAULT_VOTING_SETTINGS_SNAPSHOT;

  const [state, setState] = React.useState<VotingSettingsFormState>(() => snapshotToFormState(initialSnapshot));
  // Grace period and the new-member fast-path toggle aren't in the form; carry whatever
  // the draft started with through unchanged. (Universal support is now an exposed field.)
  const hidden = React.useMemo(() => snapshotToHidden(initialSnapshot), [initialSnapshot]);

  const parsed = parseVotingSettingsForm(state, hidden, NEW_SPACE_INITIAL_EDITOR_COUNT);
  const warnings = parsed.kind === 'ok' ? votingSettingsWarnings(state) : [];
  const canSave = parsed.kind === 'ok';

  const handleSave = () => {
    if (parsed.kind !== 'ok') return;
    setCustomSettings(parsed.value);
    setStep('enter-profile');
  };

  const handleResetDefaults = () => {
    setState(snapshotToFormState(DEFAULT_VOTING_SETTINGS_SNAPSHOT));
    setCustomSettings(null);
  };

  return (
    <StepContents childKey="configure-governance">
      <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-24">
        <Text variant="footnote" color="grey-04">
          Defaults are sensible for most spaces. See the governance page later for what each setting does.
        </Text>
        <VotingSettingsFields state={state} onChange={setState} />
        {parsed.kind === 'error' && (
          <div className="rounded bg-errorTertiary px-3 py-2 text-metadataMedium text-red-01">{parsed.message}</div>
        )}
        {warnings.map(warning => (
          <div key={warning} className="rounded border border-orange px-3 py-2 text-metadataMedium text-orange">
            {warning}
          </div>
        ))}
      </div>
      <div className="absolute inset-x-4 bottom-4 flex flex-col items-stretch gap-2">
        <Button disabled={!canSave} onClick={handleSave} className="w-full">
          Save settings
        </Button>
        <button
          type="button"
          onClick={handleResetDefaults}
          className="text-center text-metadataMedium text-grey-04 hover:text-text"
        >
          Reset to defaults
        </button>
      </div>
    </StepContents>
  );
}

const governanceText: Record<SpaceGovernanceType, string> = {
  PERSONAL: 'Personal access controls',
  DAO: 'Public governance',
};

const governanceLabel: Record<SpaceGovernanceType, string> = {
  PERSONAL: "A vote isn't required to publish edits in this space",
  DAO: 'A vote is required to publish edits in this space',
};

type StepCompleteProps = {
  onDone: () => void;
};

function StepComplete({ onDone }: StepCompleteProps) {
  const router = useRouter();

  const spaceId = useAtomValue(spaceIdAtom);
  const step = useAtomValue(stepAtom);

  const hasCompleted = step === 'completed';

  if (hasCompleted) {
    setTimeout(() => {
      onDone();
      const destination = NavUtils.toSpace(spaceId);
      router.push(destination);
    }, 3_600);
  }

  return (
    <>
      <StepContents childKey="start">
        <div className="flex w-full flex-col items-center pt-3">
          <Text as="h3" variant="bodySemibold" className={cx('mx-auto text-center text-2xl!')}>
            {step === 'completed' ? `Finalizing details...` : `Creating space...`}
          </Text>
          <Text as="p" variant="body" className="mx-auto mt-2 px-4 text-center text-base!">
            Get ready to experience a new way of creating and sharing knowledge.
          </Text>
          {step !== 'completed' && <Spacer height={32} />}
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4">
        <div className="absolute top-0 right-0 left-0 z-10 flex -translate-y-1/2 justify-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-white shadow-card">
            <Dots />
          </div>
        </div>
        <div className="relative z-0">
          <Animation active={hasCompleted} />
        </div>
      </div>
    </>
  );
}

// Helper component for image preview with fallback
type CreateSpaceImagePreviewProps = {
  image: string;
  height: number;
  width: number;
  onRemove: () => void;
};

const CreateSpaceImagePreview = ({ image, height, width, onRemove }: CreateSpaceImagePreviewProps) => {
  const { src, onError } = useImageWithFallback(image);

  return (
    <>
      <div
        style={{
          backgroundImage: `url(${src})`,
          height,
          width,
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Hidden img to trigger fallback if needed */}
        <img src={src} onError={onError} alt="" style={{ display: 'none' }} />
      </div>
      <div className="absolute top-0 right-0 p-1.5 opacity-0 transition-opacity duration-200 ease-in-out group-hover:opacity-100">
        <SquareButton disabled={image === ''} onClick={onRemove} icon={<Trash />} />
      </div>
    </>
  );
};
