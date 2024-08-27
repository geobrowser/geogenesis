'use client';

import { Content, Overlay, Portal, Root } from '@radix-ui/react-dialog';
import BoringAvatar from 'boring-avatars';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import * as React from 'react';
import { ChangeEvent, useCallback, useRef, useState } from 'react';

import { useDeploySpace } from '~/core/hooks/use-deploy-space';
import { useOnboarding } from '~/core/hooks/use-onboarding';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { Services } from '~/core/services';
import { SpaceType } from '~/core/types';
import { NavUtils, getImagePath, sleep } from '~/core/utils/utils';
import { Values } from '~/core/utils/value';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Close } from '~/design-system/icons/close';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { RadioGroup } from '~/design-system/radio-group';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

export const accountTypeAtom = atomWithStorage<SpaceType>('onboardingAccountType', 'personal');
export const nameAtom = atomWithStorage<string>('onboardingName', '');
export const avatarAtom = atomWithStorage<string>('onboardingAvatar', '');
export const spaceIdAtom = atomWithStorage<string>('onboardingSpaceId', '');

type Step = 'start' | 'select-type' | 'enter-profile' | 'create-space' | 'completed';

export const stepAtom = atomWithStorage<Step>('onboardingStep', 'start');

const workflowSteps: Array<Step> = ['create-space', 'completed'];

const MotionContent = motion(Content);
const MotionOverlay = motion(Overlay);

export const OnboardingDialog = () => {
  const { isOnboardingVisible } = useOnboarding();

  const smartAccount = useSmartAccount();

  const accountType = useAtomValue(accountTypeAtom);
  const name = useAtomValue(nameAtom);
  const avatar = useAtomValue(avatarAtom);
  const { deploy } = useDeploySpace();
  const setSpaceId = useSetAtom(spaceIdAtom);

  const [step, setStep] = useAtom(stepAtom);

  // Show retry immediately if workflow already started before initial render
  const [showRetry, setShowRetry] = useState(() => workflowSteps.includes(step));

  const address = smartAccount?.account.address;

  if (!address) return null;

  async function createSpaces(accountType: SpaceType) {
    if (!address || !accountType) return;

    try {
      const spaceId = await deploy({
        spaceAvatarUri: avatar,
        spaceName: name,
        type: accountType,
      });

      if (!spaceId) {
        throw new Error(`Creating space failed`);
      }

      // We use the space id to navigate to the space once
      // it's done deploying.
      setSpaceId(spaceId);
      setStep('completed');
    } catch (error) {
      setShowRetry(true);
      console.error(error);
    }
  }

  async function onRunOnboardingWorkflow() {
    if (!address || !smartAccount || !accountType) return;

    setShowRetry(false);

    switch (step) {
      case 'enter-profile':
        setStep('create-space');
        await sleep(100);
        createSpaces(accountType);
        break;
      case 'create-space':
        createSpaces(accountType);
        break;
    }
  }

  return (
    <Root open={isOnboardingVisible}>
      <AnimatePresence initial={false} mode="wait">
        <Portal>
          <MotionOverlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.2 }}
            transition={{ type: 'tween', ease: 'easeInOut', duration: 0.15, opacity: { duration: 0.1 } }}
            className="fixed inset-0 z-100 bg-text"
          />
          <MotionContent
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'tween', ease: 'easeInOut', duration: 0.15 }}
            className="fixed inset-0 z-[1000] flex h-full w-full items-start justify-center"
          >
            <ModalCard childKey="card">
              <StepHeader />
              {step === 'start' && <StepStart />}
              {step === 'select-type' && <StepSelectType />}
              {step === 'enter-profile' && <StepOnboarding onNext={onRunOnboardingWorkflow} address={address} />}
              {workflowSteps.includes(step) && <StepComplete onRetry={onRunOnboardingWorkflow} showRetry={showRetry} />}
            </ModalCard>
          </MotionContent>
        </Portal>
      </AnimatePresence>
    </Root>
  );
};

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
      className="pointer-events-auto relative z-100 mt-40 h-[440px] w-full max-w-[360px] overflow-hidden rounded-lg border border-grey-02 bg-white p-4 shadow-dropdown"
    >
      {children}
    </motion.div>
  );
};

const StepHeader = () => {
  const { hideOnboarding } = useOnboarding();

  const [step, setStep] = useAtom(stepAtom);

  const showBack = step === 'select-type' || step === 'enter-profile';

  const handleBack = () => {
    switch (step) {
      case 'select-type':
        setStep('start');
        break;
      case 'enter-profile':
        setStep('select-type');
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative z-20 flex items-center justify-between pb-2">
      <div className="rotate-180">
        {showBack && (
          <SquareButton icon={<RightArrowLongSmall />} onClick={handleBack} className="!border-none !bg-transparent" />
        )}
      </div>
      {!workflowSteps.includes(step) && (
        <SquareButton icon={<Close />} onClick={hideOnboarding} className="!border-none !bg-transparent" />
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

function StepStart() {
  const setStep = useSetAtom(stepAtom);

  return (
    <>
      <div className="space-y-8">
        <StepContents childKey="start">
          <div className="w-full">
            <Text as="h3" variant="bodySemibold" className="mx-auto text-center !text-2xl">
              Create your Geo account
            </Text>
            <Text as="p" variant="body" className="mx-auto mt-2 px-2 text-center !text-base">
              We’ll get you set up with a personal space, activity feed, multiple spaces to join and contribute to and
              many other things to get on with!
            </Text>
          </div>
        </StepContents>
        <div className="relative aspect-video">
          <img src="/images/onboarding/0.png" alt="" className="inline-block h-full w-full" />
        </div>
      </div>
      <div className="absolute inset-x-4 bottom-4">
        <Button onClick={() => setStep('enter-profile')} className="w-full">
          Start
        </Button>
      </div>
    </>
  );
}

function StepSelectType() {
  const [accountType, setAccountType] = useAtom(accountTypeAtom);
  const setStep = useSetAtom(stepAtom);

  const options: { image: string; label: string; value: SpaceType }[] = [
    { image: '/images/onboarding/person.png', label: 'Person', value: 'personal' },
    { image: '/images/onboarding/company.png', label: 'Company', value: 'company' },
    { image: '/images/onboarding/nonprofit.png', label: 'Nonprofit', value: 'nonprofit' },
  ];

  return (
    <>
      <StepContents childKey="account-type">
        <div className="w-full">
          <Text as="h3" variant="bodySemibold" className="mx-auto text-center !text-2xl">
            Select the account type
          </Text>
        </div>
        <div className="mt-8">
          <RadioGroup
            value={accountType ?? ''}
            onValueChange={setAccountType as (value: string) => void}
            options={options}
          />
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 space-y-4">
        <Button onClick={() => setStep('enter-profile')} disabled={accountType === null} className="w-full">
          Continue
        </Button>
      </div>
    </>
  );
}

type StepOnboardingProps = {
  onNext: () => void;
  address: string;
};

const placeholderMessage: Record<SpaceType, string> = {
  personal: 'Your name...',
  company: 'Company name',
  nonprofit: 'Nonprofit name',

  // Should never trigger these governance types
  default: 'Space name',
  'academic-field': 'Academic field name',
  region: 'Region name',
  industry: 'Industry name',
  protocol: 'Protocol name',
  dao: 'DAO name',
  'government-org': 'Government org name',
  'interest-group': 'Interest group name',
};

function StepOnboarding({ onNext, address }: StepOnboardingProps) {
  const { ipfs } = Services.useServices();
  const accountType = useAtomValue(accountTypeAtom);
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
            placeholder={placeholderMessage[accountType as SpaceType]}
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
          {accountType === 'personal' ? 'Create Account' : 'Create Space'}
        </Button>
      </div>
    </div>
  );
}

type StepCompleteProps = {
  onRetry: () => void;
  showRetry: boolean;
};

const retryMessage: Record<Step, string> = {
  start: '',
  'select-type': '',
  'enter-profile': '',
  'create-space': 'Space creation failed',
  completed: '',
};

type SpaceTypeSubsetForOnboarding = Extract<SpaceType, 'personal' | 'company' | 'nonprofit'>;

const completeMessage: Record<SpaceTypeSubsetForOnboarding, string> = {
  personal: 'Visit my personal space',
  company: 'Go to my company space',
  nonprofit: 'Go to my nonprofit space',
};

function StepComplete({ onRetry, showRetry }: StepCompleteProps) {
  const { hideOnboarding } = useOnboarding();

  const accountType = useAtomValue(accountTypeAtom);
  const spaceId = useAtomValue(spaceIdAtom);
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
            {step === 'completed'
              ? `Welcome to Geo!`
              : accountType === 'personal'
              ? `Creating your Geo account`
              : `Creating your Space`}
          </Text>
          <Text as="p" variant="body" className="mx-auto mt-2 px-4 text-center !text-base">
            {step === 'completed'
              ? `Browse content, curate information, join as a member or editor and contribute to spaces that matter to you.`
              : `This may take a minute or two to complete.`}
          </Text>
          {step !== 'completed' && (
            <>
              <Spacer height={32} />

              <div className="w-4">
                <Dots />
              </div>

              {showRetry && (
                <p className=" mt-4 text-center text-smallButton">
                  {retryMessage[step]}{' '}
                  <button onClick={onRetry} className="text-ctaPrimary">
                    Retry
                  </button>
                </p>
              )}
            </>
          )}
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 space-y-4">
        <div className="relative aspect-video">
          <img src="/images/onboarding/1.png" alt="" className="inline-block h-full w-full" />
        </div>
        <div className="flex justify-center gap-2 whitespace-nowrap">
          <Link href={NavUtils.toSpace(spaceId)} className="w-full" onClick={hideOnboarding}>
            <Button className="w-full" disabled={step !== 'completed'}>
              {completeMessage[accountType as SpaceTypeSubsetForOnboarding]}
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
