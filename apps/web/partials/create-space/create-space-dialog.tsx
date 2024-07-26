'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as Component from '@radix-ui/react-radio-group';
import BoringAvatar from 'boring-avatars';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import Link from 'next/link';

import * as React from 'react';
import { ChangeEvent, useCallback, useRef, useState } from 'react';

import { useDeploySpace } from '~/core/hooks/use-deploy-space';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { Services } from '~/core/services';
import { SpaceGovernanceType, SpaceType } from '~/core/types';
import { getImagePath, sleep } from '~/core/utils/utils';
import { Values } from '~/core/utils/value';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Close } from '~/design-system/icons/close';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { RadioGroup } from '~/design-system/radio-group';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

export const spaceTypeAtom = atom<SpaceType | null>(null);
export const governanceTypeAtom = atom<SpaceGovernanceType | null>(null);
export const nameAtom = atom<string>('');
export const avatarAtom = atom<string>('');
export const spaceIdAtom = atom<string>('');

type Step = 'select-type' | 'select-governance' | 'enter-profile' | 'create-space' | 'completed';

export const stepAtom = atom<Step>('select-type');

const workflowSteps: Array<Step> = ['create-space', 'completed'];

export function CreateSpaceDialog() {
  const smartAccount = useSmartAccount();
  const address = smartAccount?.account.address;
  const [open, onOpenChange] = useState(false);
  const { deploy } = useDeploySpace();

  const spaceType = useAtomValue(spaceTypeAtom);
  const name = useAtomValue(nameAtom);
  const avatar = useAtomValue(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const governanceType = useAtomValue(governanceTypeAtom);
  const [step, setStep] = useAtom(stepAtom);

  // Show retry immediately if workflow already started before initial render
  const [showRetry, setShowRetry] = useState(() => workflowSteps.includes(step));

  if (!address) return null;

  async function createSpaces(spaceType: SpaceType) {
    if (!address || !spaceType) return;

    try {
      const spaceId = await deploy({
        type: spaceType,
        spaceName: name,
        spaceAvatarUri: avatar,
        governanceType: governanceType ?? undefined,
      });

      if (!spaceId) {
        throw new Error(`Creating space failed`);
      }

      setSpaceId(spaceId);
      setStep('completed');
    } catch (error) {
      setShowRetry(true);
      console.error(error);
    }
  }

  async function onRunOnboardingWorkflow() {
    if (!address || !smartAccount || !spaceType) return;

    setShowRetry(false);

    switch (step) {
      case 'enter-profile':
        setStep('create-space');
        await sleep(100);
        createSpaces(spaceType);
        break;
      case 'create-space':
        createSpaces(spaceType);
        break;
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger>New space</Dialog.Trigger>

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
          <div className="pointer-events-none fixed inset-0 z-100 flex h-full w-full items-start justify-center bg-grey-04/50">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ type: 'tween', ease: 'easeInOut', duration: 0.15 }}
                className="relative z-10 flex h-full w-full items-start justify-center"
              >
                <ModalCard childKey="card">
                  <StepHeader />
                  {step === 'select-type' && <StepSelectType />}
                  {step === 'select-governance' && <SelectGovernanceType />}
                  {step === 'enter-profile' && <StepEnterProfile onNext={onRunOnboardingWorkflow} address={address} />}
                  {workflowSteps.includes(step) && (
                    <StepComplete
                      onRetry={onRunOnboardingWorkflow}
                      showRetry={showRetry}
                      onDone={() => onOpenChange(false)}
                    />
                  )}
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
      className="pointer-events-auto relative z-10 mt-32 h-full max-h-[460px] w-full max-w-[360px] overflow-hidden rounded-lg border border-grey-02 bg-white p-4 shadow-dropdown"
    >
      {children}
    </motion.div>
  );
};

const headerText: Record<Step, string> = {
  'select-type': 'Select space type',
  'select-governance': 'Select governance type',
  'enter-profile': '',
  'create-space': '',
  completed: '',
};

const StepHeader = () => {
  const spaceType = useAtomValue(spaceTypeAtom);
  const [step, setStep] = useAtom(stepAtom);

  // @TODO: Governance type
  const showBack = step === 'select-governance' || step === 'enter-profile';

  const handleBack = () => {
    switch (step) {
      case 'select-governance':
        setStep('select-type');
        break;
      case 'enter-profile':
        if (spaceType === 'default') {
          setStep('select-type');
        } else {
          setStep('select-governance');
        }
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative z-20 flex items-center justify-between pb-2">
      <div className="rotate-180">
        {showBack ? (
          <SquareButton icon={<RightArrowLongSmall />} onClick={handleBack} className="!border-none !bg-transparent" />
        ) : (
          <div className="h-1 w-4" />
        )}
      </div>
      <h3 className="text-smallTitle">{headerText[step]}</h3>
      {step !== 'create-space' ? (
        <Dialog.Close asChild>
          <SquareButton icon={<Close color="grey-04" />} className="!border-none !bg-transparent" />
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
      className="relative"
    >
      {children}
    </motion.div>
  );
};

function StepSelectType() {
  const [spaceType, setspaceType] = useAtom(spaceTypeAtom);
  const setStep = useSetAtom(stepAtom);

  const options: { image: string; label: string; value: SpaceType }[] = [
    // @TODO(migration): Defaulting to default space with governance for now since our templates
    // have not yet been migrated over. Make sure we're setting the correct value for each
    // template type.
    { image: '', label: 'Blank', value: 'default' },
    { image: '/images/onboarding/academic-field.png', label: 'Academic field', value: 'personal' },
    { image: '/images/onboarding/company.png', label: 'Company', value: 'company' },
    { image: '/images/onboarding/dao.png', label: 'DAO', value: 'dao' },
    { image: '/images/onboarding/nonprofit.png', label: 'Government organization', value: 'government-org' },
    { image: '/images/onboarding/nonprofit.png', label: 'Nonprofit', value: 'nonprofit' },
    { image: '/images/onboarding/interest-group.png', label: 'Interest group', value: 'interest-group' },
    { image: '/images/onboarding/industry.png', label: 'Industry', value: 'industry' },
    { image: '/images/onboarding/protocol.png', label: 'Protocol', value: 'protocol' },
    { image: '/images/onboarding/region.png', label: 'Region', value: 'region' },
  ];

  const onNext = () => {
    // We only let users select the governance type if they select "Blank", otherwise
    // we default to a specific governance type depending on the space type.
    if (spaceType === 'default') {
      setStep('select-governance');
    } else {
      setStep('enter-profile');
    }
  };

  return (
    <>
      <StepContents childKey="account-type">
        <div className="mt-3">
          <RadioGroup
            value={spaceType ?? ''}
            onValueChange={setspaceType as (value: string) => void}
            options={options}
          />
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 space-y-4">
        <Button onClick={onNext} disabled={spaceType === null} className="w-full">
          Continue
        </Button>
      </div>
    </>
  );
}

function SelectGovernanceType() {
  const [governanceType, setGovernanceType] = useAtom(governanceTypeAtom);
  const setStep = useSetAtom(stepAtom);

  const options: GovernanceTypeRadioOption[] = [
    {
      label: 'Public',
      value: 'PUBLIC',
      image: '/images/onboarding/public.png',
      sublabel:
        'All proposed edits go through governance and are either accepted or rejected by the Editors of the space.',
    },
    {
      label: 'Personal',
      value: 'PERSONAL',
      image: '/images/onboarding/personal.png',
      sublabel: 'All edits are automatically added without a voting period.',
    },
  ];

  return (
    <>
      <StepContents childKey="account-type">
        <div className="mt-3">
          <GovernanceTypeRadioGroup
            value={governanceType ?? ''}
            onValueChange={setGovernanceType as (value: string) => void}
            options={options}
          />
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 space-y-4">
        <Button onClick={() => setStep('enter-profile')} disabled={governanceType === null} className="w-full">
          Continue
        </Button>
      </div>
    </>
  );
}

type StepEnterProfileProps = {
  onNext: () => void;
  address: string;
};

const placeholderMessage: Record<SpaceType, string> = {
  default: 'Space name',
  company: 'Company name',
  nonprofit: 'Nonprofit name',
  personal: 'Personal name',
  'academic-field': 'Academic field name',
  region: 'Region name',
  industry: 'Industry name',
  protocol: 'Protocol name',
  dao: 'DAO name',
  'government-org': 'Government org name',
  'interest-group': 'Interest group name',
};

function StepEnterProfile({ onNext, address }: StepEnterProfileProps) {
  const { ipfs } = Services.useServices();
  const spaceType = useAtomValue(spaceTypeAtom);
  const [name, setName] = useAtom(nameAtom);
  const [avatar, setAvatar] = useAtom(avatarAtom);

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
      const ipfsUri = await ipfs.uploadFile(file);
      const imageValue = Values.toImageValue(ipfsUri);
      setAvatar(imageValue);
    }
  };

  return (
    <div className="space-y-4">
      <StepContents childKey="onboarding">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="overflow-hidden rounded-lg bg-cover bg-center shadow-lg">
              <div className="overflow-hidden rounded-lg">
                {avatar ? (
                  <div
                    style={{
                      backgroundImage: `url(${getImagePath(avatar)})`,
                      height: 152,
                      width: 152,
                      backgroundSize: 'cover',
                      backgroundRepeat: 'no-repeat',
                    }}
                  />
                ) : (
                  <BoringAvatar size={154} name={address} variant="beam" square />
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 pb-4">
            <label htmlFor="avatar-file" className="inline-block cursor-pointer text-center hover:underline">
              <SmallButton icon={<Upload />} onClick={handleFileInputClick}>
                Upload
              </SmallButton>
            </label>
            <div>
              <SquareButton disabled={avatar === ''} onClick={() => setAvatar('')} icon={<Trash />} />
            </div>
            <input
              ref={fileInputRef}
              accept="image/png, image/jpeg"
              id="avatar-file"
              onChange={handleChange}
              type="file"
              className="hidden"
            />
          </div>
        </div>
      </StepContents>
      <div className="flex w-full flex-col items-center justify-center gap-3">
        <div className="inline-block">
          <input
            placeholder={placeholderMessage[spaceType as SpaceType]}
            className="block px-2 py-1 text-center !text-2xl text-mediumTitle placeholder:opacity-25 focus:!outline-none"
            value={name}
            onChange={({ currentTarget: { value } }) => setName(value)}
            autoFocus
          />
        </div>
        <Text as="h3" variant="body" className="text-center !text-base">
          You can update this at any time.
        </Text>
      </div>

      <div className="absolute inset-x-4 bottom-4 flex">
        <Button variant="secondary" disabled={!validName} onClick={onNext} className="w-full">
          Create Space
        </Button>
      </div>
    </div>
  );
}

type StepCompleteProps = {
  onRetry: () => void;
  onDone: () => void;
  showRetry: boolean;
};

function StepComplete({ onRetry, showRetry, onDone }: StepCompleteProps) {
  const name = useAtomValue(nameAtom);
  const spaceAddress = useAtomValue(spaceIdAtom);
  const step = useAtomValue(stepAtom);

  return (
    <>
      <StepContents childKey="start">
        <div className="flex w-full flex-col items-center pt-6">
          <Text
            as="h3"
            variant="bodySemibold"
            className={cx('mx-auto text-center !text-2xl', step === 'completed' && '-mt-[24px]')}
          >
            {step === 'completed' ? `Welcome to Geo!` : `Creating Space`}
          </Text>
          <Text as="p" variant="body" className="mx-auto mt-2 px-4 text-center !text-base">
            Setting up your new space
          </Text>

          {step === 'create-space' && (
            <>
              <Spacer height={24} />

              <div className="w-6">
                <Dots color="bg-grey-02" />
              </div>
            </>
          )}

          {step !== 'completed' && showRetry && (
            <p className=" mt-4 text-center text-smallButton">
              Space creation failed{' '}
              <button onClick={onRetry} className="text-ctaPrimary">
                Retry
              </button>
            </p>
          )}
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 space-y-4">
        <div className="aspect-video">
          <img src="/images/onboarding/1.png" alt="" className="inline-block h-full w-full" />
        </div>
        <div className="flex justify-center gap-2 whitespace-nowrap">
          <Link href={`/space/${spaceAddress}`} className="w-full" onClick={onDone}>
            <Button className="w-full" disabled={step !== 'completed'}>
              Go to {name}
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}

type RadioGroupProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<GovernanceTypeRadioOption>;
};

type GovernanceTypeRadioOption = {
  value: string;
  label: string;
  sublabel: string;
  image: string;
};

function GovernanceTypeRadioGroup({ value, onValueChange, options, ...rest }: RadioGroupProps) {
  return (
    <Component.Root value={value} onValueChange={onValueChange} className="flex flex-col gap-3" {...rest}>
      {options.map(({ label, image, value, sublabel, ...rest }) => (
        <Component.Item
          key={value}
          value={value}
          className={cx(
            'data-[state=checked]:to-ctaSecondary flex items-center justify-between rounded-lg bg-divider p-4 text-text transition-all duration-300 data-[state=checked]:bg-gradient-to-tr data-[state=checked]:from-[#BAFEFF] data-[state=checked]:via-[#E5C4F6] data-[state=checked]:to-[#FFCBB4]'
          )}
          {...rest}
        >
          <div className="space-y-7">
            <div className="space-y-2">
              <h4 className="text-quoteMedium">{label}</h4>
              <p className="text-metadata">{sublabel}</p>
            </div>
            <img src={image} alt={label} className="max-h-6 w-auto" />
          </div>
        </Component.Item>
      ))}
    </Component.Root>
  );
}
