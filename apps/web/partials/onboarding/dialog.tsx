'use client';

import { useQueryClient } from '@tanstack/react-query';
import BoringAvatar from 'boring-avatars';
import cx from 'classnames';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';

import * as React from 'react';
import { ChangeEvent, useCallback, useRef, useState } from 'react';

import { useAccount, useWalletClient } from 'wagmi';

import { useOnboarding } from '~/core/hooks/use-onboarding';
import { createProfileEntity, deploySpaceContract } from '~/core/io/publish/contracts';
import { Services } from '~/core/services';
import { NavUtils, getGeoPersonIdFromOnchainId, getImagePath } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { Trash } from '~/design-system/icons/trash';
import { Upload } from '~/design-system/icons/upload';
import { Text } from '~/design-system/text';

type Step = 'start' | 'onboarding' | 'completing' | 'completed';
type PublishingStep = 'idle' | 'creating-spaces' | 'registering-profile' | 'creating-geo-profile-entity' | 'done';

export const OnboardingDialog = () => {
  const queryClient = useQueryClient();
  const { publish } = Services.useServices();
  const { address } = useAccount();
  const { data: wallet } = useWalletClient();

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');

  const [step, setStep] = useState<Step>('start');
  const [workflowStep, setWorkflowStep] = useState<PublishingStep>('idle');

  const { isOnboardingVisible } = useOnboarding();

  if (!address) return null;

  async function onRunOnboardingWorkflow() {
    if (address && workflowStep === 'idle' && wallet) {
      setStep('completing');
      setWorkflowStep('creating-spaces');

      const { spaceAddress } = await deploySpaceContract({
        account: address,
      });

      setWorkflowStep('registering-profile');

      // @TODO: The main way that onboarding might fail is if the user's transaction fails.
      // We should handle retries from the UI here. Nate has a design for it.
      const profileId = await publish.registerGeoProfile(wallet, spaceAddress);

      // Update the query cache with the new profile while we wait for the profiles subgraph to
      // index the new onchain profile.
      queryClient.setQueryData(['onchain-profile', address], {
        id: getGeoPersonIdFromOnchainId(address, profileId),
        homeSpace: spaceAddress,
        account: address,
      });

      setWorkflowStep('creating-geo-profile-entity');

      const { entityId: profileEntityId } = await createProfileEntity({
        account: address,
        spaceAddress,
        avatarUri: avatar || null,
        username: name || null,
        profileId,
      });

      console.log('Profile and personal space created:', { profileEntityId, spaceAddress });

      setWorkflowStep('done');
      setStep('completed');
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
            <ModalCard key="card">
              {step === 'start' && (
                <>
                  <StepHeader step={step} />
                  <StepStart onNext={() => setStep('onboarding')} />
                </>
              )}
              {step === 'onboarding' && (
                <>
                  <StepHeader step={step} onPrev={() => setStep('start')} />
                  <StepOnboarding
                    onNext={onRunOnboardingWorkflow}
                    address={address}
                    name={name}
                    setName={setName}
                    avatar={avatar}
                    setAvatar={setAvatar}
                  />
                </>
              )}
              {(step === 'completing' || step === 'completed') && (
                <>
                  <StepHeader step={step} />
                  <StepComplete workflowStep={workflowStep} />
                </>
              )}
            </ModalCard>
          </motion.div>
        </AnimatePresence>
      </div>
    </Command.Dialog>
  );
};

type ModalCardProps = {
  key: string;
  children: React.ReactNode;
};

const ModalCard = ({ key, children }: ModalCardProps) => {
  return (
    <motion.div
      key={key}
      initial={{ opacity: 0, bottom: -5 }}
      animate={{ opacity: 1, bottom: 0 }}
      exit={{ opacity: 0, bottom: -5 }}
      transition={{ ease: 'easeInOut', duration: 0.225 }}
      className="pointer-events-auto relative z-10 mt-32 aspect-square h-full max-h-[440px] w-full max-w-[360px] overflow-hidden rounded-lg border border-grey-02 bg-white p-4 shadow-dropdown"
    >
      {children}
    </motion.div>
  );
};

type StepHeaderProps = {
  step: Step;
  onPrev?: () => void;
};

const StepHeader = ({ step, onPrev }: StepHeaderProps) => {
  const { hideOnboarding } = useOnboarding();

  return (
    <div className="relative z-20 flex items-center justify-between pb-2">
      <div className="rotate-180">{onPrev && <SquareButton icon={<RightArrowLongSmall />} onClick={onPrev} />}</div>
      {step !== 'completing' && <SquareButton icon={<Close />} onClick={hideOnboarding} />}
    </div>
  );
};

type StepContentsProps = {
  key: string;
  children: React.ReactNode;
};

const StepContents = ({ key, children }: StepContentsProps) => {
  return (
    <motion.div
      key={key}
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

type StepStartProps = {
  onNext: () => void;
};

function StepStart({ onNext }: StepStartProps) {
  return (
    <>
      <StepContents key="start">
        <div className="w-full">
          <Text as="h3" variant="bodySemibold" className="mx-auto text-center !text-2xl">
            Create your personal space and activity feed
          </Text>
          <Text as="p" variant="body" className="mx-auto mt-2 text-center !text-base">
            Use your personal space to update your profile and monitor your account activity on GEO.
          </Text>
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 space-y-4">
        <div className="aspect-video rounded-lg bg-grey-02 shadow-lg">
          <img src="/create.png" alt="" className="h-full w-full" />
        </div>
        <Button onClick={onNext} className="w-full">
          Start
        </Button>
      </div>
    </>
  );
}

type StepOnboardingProps = {
  onNext: () => void;
  address: string;
  name: string;
  setName: (name: string) => void;
  avatar: string;
  setAvatar: (hash: string) => void;
};

function StepOnboarding({ onNext, address, name, setName, avatar, setAvatar }: StepOnboardingProps) {
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
      <StepContents key="onboarding">
        <div className="flex w-full justify-center">
          <div className="inline-block pb-4">
            <input
              placeholder="Name..."
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
          Continue
        </Button>
      </div>
    </>
  );
}

type StepCompleteProps = {
  workflowStep: PublishingStep;
};

const stageAsNumber = {
  idle: 0,
  'creating-spaces': 1,
  'registering-profile': 2,
  'creating-geo-profile-entity': 3,
  done: 4,
};

function StepComplete({ workflowStep: stage }: StepCompleteProps) {
  const { hideOnboarding } = useOnboarding();

  return (
    <>
      <StepContents key="start">
        <div className="w-full">
          <Text as="h3" variant="bodySemibold" className="mx-auto text-center !text-2xl">
            {stage === 'creating-spaces' ? `Welcome to GEO!` : `Creating profile and feed`}
          </Text>
          <Text as="p" variant="body" className="mx-auto mt-2 text-center !text-base">
            {complete[stageAsNumber[stage]]}
          </Text>
          <div className="mx-auto mt-2 w-1/3">
            <Progress stage={stageAsNumber[stage]} />
          </div>
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 space-y-4">
        <div className="aspect-video rounded-lg bg-grey-02 shadow-lg">
          <img src="/creating.png" alt="" className="h-full w-full" />
        </div>
        <div className="flex justify-center gap-2 whitespace-nowrap">
          <Link href={NavUtils.toHome()} className="w-full" onClick={hideOnboarding}>
            <Button className="w-full" disabled={stage !== 'done'}>
              View Personal Home
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}

const complete: Record<number, string> = {
  1: `Step 1. Creating your personal space.`,
  2: `Step 2. Sign the transaction to create your profile.`,
  3: `Step 3. Finishing setting up your space...`,
  4: `Start browsing content, voting on what matters, joining spaces and contributing to GEO as an editor.`,
};

type ProgressProps = {
  stage: number;
};

const Progress = ({ stage }: ProgressProps) => {
  return (
    <div className="flex gap-1">
      <Indicator index={1} stage={stage} />
      <Indicator index={2} stage={stage} />
      <Indicator index={3} stage={stage} />
    </div>
  );
};

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
        className={cx('absolute bottom-0 left-0 top-0 bg-black', index === stage && 'animate-pulse')}
      />
    </div>
  );
};

const getWidth = (index: number, stage: number) => {
  if (index > stage) {
    return '0%';
  }

  if (index === stage) {
    return '50%';
  }

  if (index < stage) {
    return '100%';
  }
};
