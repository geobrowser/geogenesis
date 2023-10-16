'use client';

import { observer } from '@legendapp/state/react';
import BoringAvatar from 'boring-avatars';
import cx from 'classnames';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';

import * as React from 'react';
import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';

import { useAccount } from 'wagmi';

import { useOnboarding } from '~/core/hooks/use-onboarding';
import { deploySpaceContract } from '~/core/io/publish/contracts';
import { Services } from '~/core/services';
import { getImagePath, sleepWithCallback } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Text } from '~/design-system/text';

type Step = 'start' | 'onboarding' | 'completing' | 'completed';

export const OnboardingDialog = observer(() => {
  const { address } = useAccount();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [step, setStep] = useState<Step>('start');
  const [workflowStep, setWorkflowStep] = useState<'idle' | 'creating-spaces' | 'creating-profile' | 'done'>('idle');

  if (!address) return null;

  async function onRunOnboardingWorkflow() {
    if (address && workflowStep === 'idle') {
      setStep('completing');

      setWorkflowStep('creating-spaces');

      const { spaceAddress } = await deploySpaceContract({
        account: address,
        username: name || null,
        avatarUri: avatar || null,
      });

      console.log('spaceAddress', spaceAddress);
      setWorkflowStep('creating-profile');

      await sleepWithCallback(() => setWorkflowStep('done'), 5000);
    }
  }

  // Note: set open to true or to isOnboardingVisible to see the onboarding flow
  // Currently stubbed as we don't have a way to create a profile yet
  // Also note that setting open to true will cause SSR issues in dev mode
  return (
    <Command.Dialog open={true} label="Onboarding profile">
      <div className="pointer-events-none fixed inset-0 z-100 flex h-full w-full items-start justify-center bg-grey-04/50">
        <AnimatePresence initial={false} mode="wait">
          <div className="relative z-10 flex h-full w-full items-start justify-center">
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
                  <StepComplete onNext={() => setStep('completed')} workflowStep={workflowStep} />
                </>
              )}
            </ModalCard>
          </div>
        </AnimatePresence>
      </div>
    </Command.Dialog>
  );
});

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
      className="pointer-events-auto relative z-10 mt-32 aspect-square h-full max-h-[440px] w-full max-w-[360px] overflow-hidden rounded border border-grey-02 bg-white p-4 shadow-dropdown"
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
      <div className="rotate-180">{onPrev && <SquareButton icon="rightArrowLongSmall" onClick={onPrev} />}</div>
      {step !== 'completing' && <SquareButton icon="close" onClick={hideOnboarding} />}
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
        <div className="aspect-video rounded bg-grey-02 shadow-lg">
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
          <div className="rounded border-8 border-white bg-cover bg-center shadow-card">
            <div className="overflow-hidden rounded">
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
            <SmallButton icon="upload" onClick={handleFileInputClick}>
              Upload
            </SmallButton>
          </label>
          {avatar !== '' && (
            <div>
              <SquareButton onClick={() => setAvatar('')} icon="trash" />
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
  onNext: () => void;
  workflowStep: 'idle' | 'creating-spaces' | 'creating-profile' | 'done';
};

function StepComplete({ onNext, workflowStep: stage }: StepCompleteProps) {
  // useEffect(() => {
  //   if (stage >= 5) {
  //     onNext();
  //     return;
  //   }

  //   setTimeout(() => {
  //     const nextStage = stage + 1;
  //     setStage(nextStage);
  //   }, 10_000);
  // }, [stage, onNext]);

  const stageAsNumber = {
    idle: 0,
    'creating-spaces': 1,
    'creating-profile': 2,
    done: 3,
  };

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
          {stage !== 'creating-profile' && (
            <div className="mx-auto mt-2 w-1/3">
              <Progress stage={stageAsNumber[stage]} />
            </div>
          )}
        </div>
      </StepContents>
      <div className="absolute inset-x-4 bottom-4 space-y-4">
        <div className="aspect-video rounded bg-grey-02 shadow-lg">
          <img src="/creating.png" alt="" className="h-full w-full" />
        </div>
        <div className="flex justify-center gap-2 whitespace-nowrap">
          <Button onClick={() => null} className="!flex-1 !flex-shrink-0" disabled={stage !== 'done'}>
            View Feed
          </Button>
          <Button onClick={() => null} className="!flex-1" disabled={stage !== 'done'}>
            View Personal Space
          </Button>
        </div>
      </div>
    </>
  );
}

const complete: Record<number, string> = {
  1: `Step 1. Creating your personal space.`,
  2: `Step 2. Sign the transaction to create your profile.`,
  3: `Start browsing content, voting on what matters, joining spaces and contributing to GEO as an editor.`,
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
          ease: 'linear',
          duration: 1,
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
