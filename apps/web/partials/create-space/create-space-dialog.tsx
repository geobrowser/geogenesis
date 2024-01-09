'use client';

import * as Dialog from '@radix-ui/react-dialog';
import BoringAvatar from 'boring-avatars';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import Link from 'next/link';

import * as React from 'react';
import { ChangeEvent, useCallback, useRef, useState } from 'react';

import { useAccount, useWalletClient } from 'wagmi';

import { useOnboarding } from '~/core/hooks/use-onboarding';
import { createSpaceWithEntities } from '~/core/io/publish/contracts';
import { Services } from '~/core/services';
import { SpaceType } from '~/core/types';
import { getImagePath, sleep } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

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
export const nameAtom = atom<string>('');
export const avatarAtom = atom<string>('');
export const spaceAddressAtom = atom<string>('');

type Step = 'start' | 'select-type' | 'onboarding' | 'creating-spaces' | 'completed';

export const stepAtom = atom<Step>('start');

const workflowSteps: Array<Step> = ['creating-spaces', 'completed'];

// @TODO: Can remove a lot of this stuff since there's only one error to handle, one "creating" state etc
export function CreateSpaceDialog() {
  const { address } = useAccount();
  const { data: wallet } = useWalletClient();

  // @TODO: These don't need to be persisted
  const spaceType = useAtomValue(spaceTypeAtom);
  const name = useAtomValue(nameAtom);
  const avatar = useAtomValue(avatarAtom);
  const setSpaceAddress = useSetAtom(spaceAddressAtom);

  const [step, setStep] = useAtom(stepAtom);

  // Show retry immediately if workflow already started before initial render
  const [showRetry, setShowRetry] = useState(() => workflowSteps.includes(step));

  if (!address) return null;

  async function createSpaces(spaceType: SpaceType) {
    if (!address || !spaceType) return;

    try {
      const { spaceAddress } = await createSpaceWithEntities({
        spaceAvatarUri: avatar,
        spaceName: name,
        type: spaceType,
        userAccount: address,
      });

      if (!spaceAddress) {
        throw new Error(`Creating space failed`);
      }

      setSpaceAddress(spaceAddress);
    } catch (error) {
      setShowRetry(true);
      console.error(error);
    }
  }

  async function onRunOnboardingWorkflow() {
    if (!address || !wallet || !spaceType) return;

    setShowRetry(false);

    switch (step) {
      case 'onboarding':
        setStep('creating-spaces');
        await sleep(100);
        createSpaces(spaceType);
        break;
      case 'creating-spaces':
        createSpaces(spaceType);
        break;
    }
  }

  return (
    <Dialog.Root>
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
                  {step === 'start' && <StepStart />}
                  {step === 'select-type' && <StepSelectType />}
                  {step === 'onboarding' && <StepOnboarding onNext={onRunOnboardingWorkflow} address={address} />}
                  {workflowSteps.includes(step) && (
                    <StepComplete onRetry={onRunOnboardingWorkflow} showRetry={showRetry} />
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
      className="pointer-events-auto relative z-10 mt-32 h-full max-h-[440px] w-full max-w-[360px] overflow-hidden rounded-lg border border-grey-02 bg-white p-4 shadow-dropdown"
    >
      {children}
    </motion.div>
  );
};

const StepHeader = () => {
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
        <Dialog.Close asChild>
          <SquareButton icon={<Close />} className="!border-none !bg-transparent" />
        </Dialog.Close>
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
            Create a Space
          </Text>
          <Text as="p" variant="body" className="mx-auto mt-2 px-8 text-center !text-base">
            We’ll get you set up a new Geo Space
          </Text>
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 space-y-4">
        <div className="aspect-video">
          <div className="-m-[16px]">
            <img src="/images/onboarding/0.png" alt="" className="inline-block h-full w-full" />
          </div>
        </div>
        <Button onClick={() => setStep('select-type')} className="w-full">
          Start
        </Button>
      </div>
    </>
  );
}

function StepSelectType() {
  const [spaceType, setspaceType] = useAtom(spaceTypeAtom);
  const setStep = useSetAtom(stepAtom);

  const options = [
    { image: '/images/onboarding/person.png', label: 'Default', value: 'default' },
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
            value={spaceType ?? ''}
            onValueChange={setspaceType as (value: string) => void}
            options={options}
          />
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 space-y-4">
        <Button onClick={() => setStep('onboarding')} disabled={spaceType === null} className="w-full">
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
  default: 'Space name',
  company: 'Company name',
  nonprofit: 'Nonprofit name',
};

function StepOnboarding({ onNext, address }: StepOnboardingProps) {
  const spaceType = useAtomValue(spaceTypeAtom);
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
              placeholder={placeholderMessage[spaceType as SpaceType]}
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
          Create Space
        </Button>
      </div>
    </>
  );
}

type StepCompleteProps = {
  onRetry: () => void;
  showRetry: boolean;
};

function StepComplete({ onRetry, showRetry }: StepCompleteProps) {
  // @TODO: Close the dialog
  const { hideOnboarding } = useOnboarding();

  const name = useAtomValue(nameAtom);
  const spaceAddress = useAtomValue(spaceAddressAtom);
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

          <Spacer height={24} />

          <div className="w-6">
            <Dots color="bg-grey-02" />
          </div>

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
          <div className="-m-[16px]">
            <img src="/images/onboarding/1.png" alt="" className="inline-block h-full w-full" />
          </div>
        </div>
        <div className="flex justify-center gap-2 whitespace-nowrap">
          <Link href={`/space/${spaceAddress}`} className="w-full" onClick={hideOnboarding}>
            <Button className="w-full" disabled={step !== 'completed'}>
              Go to {name}
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
