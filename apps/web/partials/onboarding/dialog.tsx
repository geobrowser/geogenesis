'use client';

import { useQueryClient } from '@tanstack/react-query';
import BoringAvatar from 'boring-avatars';
import cx from 'classnames';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import Link from 'next/link';

import * as React from 'react';
import { ChangeEvent, useCallback, useRef, useState } from 'react';

import { useAccount, useWalletClient } from 'wagmi';

import { useOnboarding } from '~/core/hooks/use-onboarding';
import { type AccountType, createProfileEntity, deploySpaceContract } from '~/core/io/publish/contracts';
import { Services } from '~/core/services';
import { getGeoPersonIdFromOnchainId, getImagePath, sleep } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { RadioGroup } from '~/design-system/radio-group';
import { Text } from '~/design-system/text';

export const accountTypeAtom = atomWithStorage<AccountType | null>('onboardingAccountType', null);
export const nameAtom = atomWithStorage<string>('onboardingName', '');
export const avatarAtom = atomWithStorage<string>('onboardingAvatar', '');
export const spaceAddressAtom = atomWithStorage<string>('onboardingSpaceAddress', '');
export const profileIdAtom = atomWithStorage<string>('onboardingProfileId', '');

type Step =
  | 'start'
  | 'select-type'
  | 'onboarding'
  | 'creating-spaces'
  | 'registering-profile'
  | 'creating-geo-profile-entity'
  | 'completed';

export const stepAtom = atomWithStorage<Step>('onboardingStep', 'start');

const workflowSteps: Array<Step> = [
  'creating-spaces',
  'registering-profile',
  'creating-geo-profile-entity',
  'completed',
];

export const OnboardingDialog = () => {
  const { isOnboardingVisible } = useOnboarding();

  const { address } = useAccount();
  const { data: wallet } = useWalletClient();
  const { publish } = Services.useServices();
  const queryClient = useQueryClient();

  const accountType = useAtomValue(accountTypeAtom);
  const name = useAtomValue(nameAtom);
  const avatar = useAtomValue(avatarAtom);
  const [spaceAddress, setSpaceAddress] = useAtom(spaceAddressAtom);
  const [profileId, setProfileId] = useAtom(profileIdAtom);

  const [step, setStep] = useAtom(stepAtom);

  // Show retry immediately if workflow already started before initial render
  const [showRetry, setShowRetry] = useState(() => workflowSteps.includes(step));

  if (!address) return null;

  async function createSpaces(accountType: AccountType) {
    if (!address || !accountType) return;

    try {
      const { spaceAddress } = await deploySpaceContract({
        account: address,
      });

      if (!spaceAddress) {
        throw new Error(`Creating space failed`);
      }

      setSpaceAddress(spaceAddress);

      setStep('registering-profile');

      setTimeout(() => {
        registerProfile(spaceAddress, accountType);
      }, 100);
    } catch (error) {
      setShowRetry(true);
      console.error(error);
    }
  }

  async function registerProfile(spaceAddress: `0x${string}`, accountType: AccountType) {
    if (!address || !wallet || !accountType) return;

    try {
      const profileId = await publish.registerGeoProfile(wallet, spaceAddress);

      if (!profileId) {
        throw new Error(`Registering profile failed`);
      }

      setProfileId(`${profileId}`);

      // Update the query cache with the new profile while we wait for the profiles subgraph to
      // index the new onchain profile.
      queryClient.setQueryData(['onchain-profile', address], {
        id: getGeoPersonIdFromOnchainId(address, profileId),
        homeSpace: spaceAddress,
        account: address,
      });

      setStep('creating-geo-profile-entity');

      setTimeout(() => {
        createGeoProfileEntity(spaceAddress, profileId, accountType);
      }, 100);
    } catch (error) {
      setShowRetry(true);
      console.error(error);
    }
  }

  async function createGeoProfileEntity(spaceAddress: `0x${string}`, profileId: string, accountType: AccountType) {
    if (!address || !accountType) return;

    try {
      const { entityId: profileEntityId } = await createProfileEntity({
        account: address,
        spaceAddress: spaceAddress as `0x${string}`,
        avatarUri: avatar || null,
        username: name || null,
        profileId: profileId,
        accountType,
      });

      if (!profileEntityId) {
        throw new Error(`Creating Geo profile entity failed`);
      }

      console.log('Profile and personal space created:', { profileEntityId, spaceAddress });

      await sleep(3_000);

      setStep('completed');
    } catch (error) {
      setShowRetry(true);
      console.error(error);
    }
  }

  async function onRunOnboardingWorkflow() {
    if (!address || !wallet || !accountType) return;

    setShowRetry(false);

    switch (step) {
      case 'onboarding':
        setStep('creating-spaces');
        await sleep(100);
        createSpaces(accountType);
        break;
      case 'creating-spaces':
        createSpaces(accountType);
        break;
      case 'registering-profile':
        registerProfile(spaceAddress as `0x${string}`, accountType);
        break;
      case 'creating-geo-profile-entity':
        createGeoProfileEntity(spaceAddress as `0x${string}`, profileId, accountType);
        break;
    }
  }

  return (
    <Command.Dialog open={isOnboardingVisible} label="Onboarding profile">
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
              {step === 'start' && <StepStart />}
              {step === 'select-type' && <StepSelectType />}
              {step === 'onboarding' && <StepOnboarding onNext={onRunOnboardingWorkflow} address={address} />}
              {workflowSteps.includes(step) && <StepComplete onRetry={onRunOnboardingWorkflow} showRetry={showRetry} />}
            </ModalCard>
          </motion.div>
        </AnimatePresence>
      </div>
    </Command.Dialog>
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
      className="pointer-events-auto relative z-10 mt-32 h-full max-h-[440px] w-full max-w-[360px] overflow-hidden rounded-lg border border-grey-02 bg-white p-4 shadow-dropdown"
    >
      {children}
    </motion.div>
  );
};

const StepHeader = () => {
  const { hideOnboarding } = useOnboarding();

  const [step, setStep] = useAtom(stepAtom);

  const showBack = step === 'select-type' || step === 'onboarding';

  const handleBack = () => {
    switch (step) {
      case 'select-type':
        setStep('start');
        break;
      case 'onboarding':
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
      <StepContents childKey="start">
        <div className="w-full">
          <Text as="h3" variant="bodySemibold" className="mx-auto text-center !text-2xl">
            Create your Geo account
          </Text>
          <Text as="p" variant="body" className="mx-auto mt-2 px-8 text-center !text-base">
            We’ll get you set up with a profile, <br className="xl:hidden" />
            personal space and activity feed.
          </Text>
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 space-y-4">
        <div className="aspect-video">
          <div className="-m-[16px]">
            <img src="/images/onboarding/0.png" alt="" className="inline-block h-full w-full" />
          </div>
        </div>
        <p className="text-center text-footnoteMedium">
          Creating an account requires a small amount of{' '}
          <a
            href="https://www.coinbase.com/how-to-buy/polygon"
            target="_blank"
            rel="noopenner noreferrer"
            className="text-ctaPrimary"
          >
            Polygon MATIC
          </a>
        </p>
        <Button onClick={() => setStep('select-type')} className="w-full">
          Start
        </Button>
      </div>
    </>
  );
}

function StepSelectType() {
  const [accountType, setAccountType] = useAtom(accountTypeAtom);
  const setStep = useSetAtom(stepAtom);

  const options = [
    { image: '/images/onboarding/person.png', label: 'Person', value: 'person' },
    // @TODO restore once company spaces are ready
    // { image: '/images/onboarding/company.png', label: 'Company', value: 'company', disabled: true },
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
        <Button onClick={() => setStep('onboarding')} disabled={accountType === null} className="w-full">
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

const placeholderMessage: Record<AccountType, string> = {
  person: 'Your name',
  company: 'Company name',
  nonprofit: 'Nonprofit name',
};

function StepOnboarding({ onNext, address }: StepOnboardingProps) {
  const accountType = useAtomValue(accountTypeAtom);
  const [name, setName] = useAtom(nameAtom);
  const [avatar, setAvatar] = useAtom(avatarAtom);

  const validName = name.length > 0;

  const { storageClient } = Services.useServices();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const file = e.target.files[0];
      const ipfsUri = await storageClient.uploadFile(file);
      const imageValue = Value.toImageValue(ipfsUri);
      setAvatar(imageValue);
    }
  };

  return (
    <>
      <StepContents childKey="onboarding">
        <div className="flex w-full justify-center">
          <div className="inline-block pb-4">
            <input
              placeholder={placeholderMessage[accountType as AccountType]}
              className="block px-2 py-1 text-center !text-2xl text-mediumTitle placeholder:opacity-25 focus:!outline-none"
              value={name}
              onChange={({ currentTarget: { value } }) => setName(value)}
              autoFocus
            />
          </div>
        </div>
        <div className="flex justify-center pb-4">
          <div className="rounded-lg border-8 border-white bg-cover bg-center shadow-card">
            <div className="overflow-hidden rounded-lg">
              {avatar ? (
                <div
                  style={{
                    backgroundImage: `url(${getImagePath(avatar)})`,
                    height: 154,
                    width: 154,
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
          {avatar !== '' && (
            <div>
              <SquareButton onClick={() => setAvatar('')} icon={<Trash />} />
            </div>
          )}
          <input
            ref={fileInputRef}
            accept="image/png, image/jpeg"
            id="avatar-file"
            onChange={handleChange}
            type="file"
            className="hidden"
          />
        </div>
        <Text as="h3" variant="body" className="text-center !text-base">
          You can update this later.
        </Text>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 flex">
        <Button variant="secondary" disabled={!validName} onClick={onNext} className="w-full">
          Create Account
        </Button>
      </div>
    </>
  );
}

type StepCompleteProps = {
  onRetry: () => void;
  showRetry: boolean;
};

const stepNumber: Record<Step, number> = {
  start: 0,
  'select-type': 0,
  onboarding: 0,
  'creating-spaces': 1,
  'registering-profile': 2,
  'creating-geo-profile-entity': 3,
  completed: 4,
};

const retryMessage: Record<Step, string> = {
  start: '',
  'select-type': '',
  onboarding: '',
  'creating-spaces': 'Space creation failed',
  'registering-profile': 'Profile registration failed',
  'creating-geo-profile-entity': 'Geo profile creation failed',
  completed: '',
};

const completeMessage: Record<AccountType, string> = {
  person: 'Go to my personal space',
  company: 'Go to my company space',
  nonprofit: 'Go to my nonprofit space',
};

function StepComplete({ onRetry, showRetry }: StepCompleteProps) {
  const { hideOnboarding } = useOnboarding();

  const accountType = useAtomValue(accountTypeAtom);
  const spaceAddress = useAtomValue(spaceAddressAtom);
  const step = useAtomValue(stepAtom);

  return (
    <>
      <StepContents childKey="start">
        <div className="w-full pt-6">
          <Text
            as="h3"
            variant="bodySemibold"
            className={cx('mx-auto text-center !text-2xl', step === 'completed' && '-mt-[24px]')}
          >
            {step === 'completed' ? `Welcome to Geo!` : `Creating Geo account`}
          </Text>
          <Text as="p" variant="body" className="mx-auto mt-2 px-4 text-center !text-base">
            {complete[stepNumber[step]].label}
          </Text>
          {step !== 'completed' && (
            <div className="mx-auto mt-2 w-1/3">
              <Progress stage={stepNumber[step]} />
            </div>
          )}
          {step !== 'completed' && showRetry && (
            <p className=" mt-4 text-center text-smallButton">
              {retryMessage[step]}{' '}
              <button onClick={onRetry} className="text-ctaPrimary">
                Retry
              </button>
            </p>
          )}
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 space-y-4">
        <div className="aspect-video">
          <div className="-m-[16px]">
            <img src={complete[stepNumber[step]].image} alt="" className="inline-block h-full w-full" />
          </div>
        </div>
        <div className="flex justify-center gap-2 whitespace-nowrap">
          <Link href={`/space/${spaceAddress}`} className="w-full" onClick={hideOnboarding}>
            <Button className="w-full" disabled={step !== 'completed'}>
              {completeMessage[accountType as AccountType]}
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}

const complete: Record<number, { label: string; image: string }> = {
  1: { label: `Setting up your profile and personal space`, image: `/images/onboarding/1.png` },
  2: { label: `Sign the transaction from your wallet`, image: `/images/onboarding/2.png` },
  3: { label: `Finalizing account creation`, image: `/images/onboarding/1.png` },
  4: {
    label: `Browse content, vote on what matters, join spaces and contribute to spaces that interest you as an editor`,
    image: `/images/onboarding/3.png`,
  },
};

type ProgressProps = {
  stage: number;
};

const Progress = ({ stage }: ProgressProps) => (
  <div className="flex gap-1">
    <Indicator index={1} stage={stage} />
    <Indicator index={2} stage={stage} />
    <Indicator index={3} stage={stage} />
  </div>
);

type IndicatorProps = {
  index: number;
  stage: number;
};

const Indicator = ({ index, stage }: IndicatorProps) => {
  const width = getWidth(index, stage);

  return (
    <div className="relative h-1.5 flex-1 overflow-clip rounded-full bg-grey-02">
      <motion.div
        transition={{
          ease: 'easeOut',
          duration: 0.5,
          bounce: 0,
          delay: index >= stage ? 1 : 0,
        }}
        animate={{ width }}
        className={cx('absolute bottom-0 left-0 top-0 bg-black', index === stage && 'animate-pulse-strong')}
      />
    </div>
  );
};

const getWidth = (index: number, stage: number) => {
  if (index > stage) return '0%';
  if (index === stage) return '50%';
  if (index < stage) return '100%';
};
