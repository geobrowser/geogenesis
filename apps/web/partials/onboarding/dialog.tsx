'use client';

import { SYSTEM_IDS } from '@graphprotocol/grc-20';
import { Content, Overlay, Portal, Root } from '@radix-ui/react-dialog';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useRouter } from 'next/navigation';

import * as React from 'react';
import { ChangeEvent, useCallback, useRef, useState } from 'react';

import { useDeploySpace } from '~/core/hooks/use-deploy-space';
import { useOnboarding } from '~/core/hooks/use-onboarding';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { queryClient } from '~/core/query-client';
import { Services } from '~/core/services';
import { NavUtils, getImagePath, sleep } from '~/core/utils/utils';

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

export const nameAtom = atomWithStorage<string>('onboardingName', '');
export const entityIdAtom = atomWithStorage<string>('onboardingEntityId', '');
export const avatarAtom = atomWithStorage<string>('onboardingAvatar', '');
export const spaceIdAtom = atomWithStorage<string>('onboardingSpaceId', '');

type Step = 'start' | 'enter-profile' | 'create-space' | 'completed';

export const stepAtom = atomWithStorage<Step>('onboardingStep', 'start');

const workflowSteps: Array<Step> = ['create-space', 'completed'];

const MotionContent = motion(Content);
const MotionOverlay = motion(Overlay);

export const OnboardingDialog = () => {
  const { isOnboardingVisible } = useOnboarding();

  const { smartAccount } = useSmartAccount();
  const name = useAtomValue(nameAtom);
  const avatar = useAtomValue(avatarAtom);
  const entityId = useAtomValue(entityIdAtom);
  const { deploy } = useDeploySpace();
  const setSpaceId = useSetAtom(spaceIdAtom);

  const [step, setStep] = useAtom(stepAtom);

  // Show retry immediately if workflow already started before initial render
  const [showRetry, setShowRetry] = useState(() => workflowSteps.includes(step));

  const address = smartAccount?.account.address;

  if (!address) return null;

  async function createSpace() {
    if (!address) return;

    try {
      const spaceId = await deploy({
        spaceImage: avatar,
        spaceName: name,
        type: 'personal',
        entityId,
      });

      if (!spaceId) {
        throw new Error(`Creating space failed`);
      }

      // Forces the profile to be refetched
      await queryClient.invalidateQueries({ queryKey: ['profile', address] });

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
    if (!address || !smartAccount) return;

    setShowRetry(false);

    switch (step) {
      case 'enter-profile':
        setStep('create-space');
        await sleep(100);
        createSpace();
        break;
      case 'create-space':
        createSpace();
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
  const setName = useSetAtom(nameAtom);
  const setEntityId = useSetAtom(entityIdAtom);

  const showBack = step === 'enter-profile';

  const handleBack = () => {
    setName('');
    setEntityId('');
    switch (step) {
      case 'enter-profile':
        setStep('start');
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
              Create your first space
            </Text>
            <Text as="p" variant="body" className="mx-auto mt-2 text-center !text-base">
              This space will represent you. After, you can create spaces on any topic - including projects or groups
              you're a part of - linked with any Geo accounts.
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

type StepOnboardingProps = {
  onNext: () => void;
  address: string;
};

function StepOnboarding({ onNext }: StepOnboardingProps) {
  const { ipfs } = Services.useServices();
  const [name, setName] = useAtom(nameAtom);
  const [entityId, setEntityId] = useAtom(entityIdAtom);

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
      setAvatar(ipfsUri);
    }
  };

  const allowedTypes = [SYSTEM_IDS.SPACE_TYPE, SYSTEM_IDS.PROJECT_TYPE, SYSTEM_IDS.PERSON_TYPE];

  return (
    <div className="space-y-4">
      <StepContents childKey="onboarding">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="overflow-hidden rounded-lg bg-cover bg-center shadow-lg">
              <div className="group relative overflow-hidden rounded-lg">
                {avatar ? (
                  <>
                    <div
                      style={{
                        backgroundImage: `url(${getImagePath(avatar)})`,
                        height: 152,
                        width: 152,
                        backgroundSize: 'cover',
                        backgroundRepeat: 'no-repeat',
                      }}
                    />
                    <div className="absolute right-0 top-0 p-1.5 opacity-0 transition-opacity duration-200 ease-in-out group-hover:opacity-100">
                      <SquareButton disabled={avatar === ''} onClick={() => setAvatar('')} icon={<Trash />} />
                    </div>
                  </>
                ) : (
                  <img src="/images/onboarding/no-avatar.png" alt="" className="size-[152px] object-cover" />
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 pb-4">
            <label htmlFor="avatar-file" className="inline-block cursor-pointer text-center hover:underline">
              <SmallButton icon={<Upload />} onClick={handleFileInputClick}>
                Upload Avatar
              </SmallButton>
            </label>
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
        <div className="relative z-100 inline-block">
          <div className={cx(entityId && 'invisible')}>
            <FindEntity
              allowedTypes={allowedTypes}
              onDone={entity => {
                setName(entity.name ?? '');
                setEntityId(entity.id);
              }}
              onCreateEntity={entity => {
                setName(entity.name ?? '');
                setEntityId('');
              }}
              placeholder="Your name..."
            />
          </div>
          {entityId && (
            <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-1">
              <div className="text-bodySemibold">Space for</div>
              <SmallButton
                onClick={() => {
                  setName('');
                  setEntityId('');
                }}
              >
                <span>{name}</span>
                <CloseSmall />
              </SmallButton>
            </div>
          )}
        </div>
      </div>
      <div className="absolute inset-x-4 bottom-4 flex">
        <div className="absolute left-0 right-0 top-0 z-100 flex -translate-y-full justify-center pb-4">
          <Tooltip
            trigger={
              <div className="inline-flex cursor-pointer items-center gap-1 text-grey-04">
                <Text as="h3" variant="footnote" className="text-center">
                  Personal access controls
                </Text>
                <div>
                  <QuestionCircle />
                </div>
              </div>
            }
            label="A vote isn’t required to publish edits in this space"
            position="top"
          />
        </div>
        <Button disabled={!validName} onClick={onNext} className="w-full">
          Create Space
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
  'enter-profile': '',
  'create-space': 'Space creation failed',
  completed: '',
};

function StepComplete({ onRetry, showRetry }: StepCompleteProps) {
  const { hideOnboarding } = useOnboarding();
  const router = useRouter();

  const spaceId = useAtomValue(spaceIdAtom);
  const step = useAtomValue(stepAtom);

  const hasCompleted = step === 'completed';

  if (hasCompleted) {
    setTimeout(() => {
      hideOnboarding();
      const destination = NavUtils.toSpace(spaceId);
      router.push(destination);
    }, 3_600);
  }

  return (
    <>
      <StepContents childKey="start">
        <div className="flex w-full flex-col items-center pt-3">
          <Text as="h3" variant="bodySemibold" className={cx('mx-auto text-center !text-2xl')}>
            {step === 'completed' ? `Finalizing details...` : `Creating space...`}
          </Text>
          <Text as="p" variant="body" className="mx-auto mt-2 px-4 text-center !text-base">
            Get ready to experience a new way of creating and sharing knowledge.
          </Text>
          {step !== 'completed' && (
            <>
              <Spacer height={32} />
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
      <div className="absolute inset-x-4 bottom-4">
        <div className="absolute left-0 right-0 top-0 z-10 flex -translate-y-1/2 justify-center">
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

export const Animation = ({ active = false }) => {
  return (
    <div className="bg-gradient-geo relative flex h-[272px] w-[328px] items-center justify-center overflow-clip rounded">
      <div className="absolute -left-5 top-3">
        <div
          className={cx('transition duration-300', active ? 'translate-x-2 translate-y-2 opacity-50' : 'opacity-20')}
        >
          <img src="/images/onboarding/top-left.png" alt="" className="w-1/2" />
        </div>
      </div>
      <div className="absolute -right-20 -top-6">
        <div
          className={cx('transition duration-300', active ? '-translate-x-2 translate-y-2 opacity-50' : 'opacity-20')}
        >
          <img src="/images/onboarding/top-right.png" alt="" className="w-1/2" />
        </div>
      </div>
      <div className="absolute -right-16 bottom-0 top-0 flex items-center">
        <div className={cx('transition duration-300', active ? '-translate-x-2 opacity-50' : 'opacity-20')}>
          <img src="/images/onboarding/right-middle.png" alt="" className="w-1/2" />
        </div>
      </div>
      <div className="absolute -bottom-8 -right-48">
        <div
          className={cx('transition duration-300', active ? '-translate-x-2 -translate-y-2 opacity-50' : 'opacity-20')}
        >
          <img src="/images/onboarding/right-bottom.png" alt="" className="w-1/2" />
        </div>
      </div>
      <div className="absolute -bottom-4 -left-4">
        <div
          className={cx('transition duration-300', active ? '-translate-y-2 translate-x-2 opacity-50' : 'opacity-20')}
        >
          <img src="/images/onboarding/left-bottom.png" alt="" className="w-1/2" />
        </div>
      </div>
      <div className="z-1000 relative -mb-6">
        <img src="/images/onboarding/main.png" alt="" className="h-auto w-[246px]" />
      </div>
      <div className="absolute bottom-8 left-3">
        <div className={cx('transition duration-300', active ? '-translate-y-2 opacity-100' : 'opacity-0')}>
          <img src="/images/onboarding/left-middle-float.png" alt="" className="w-1/2" />
        </div>
      </div>
      <div className="absolute -right-16 top-12">
        <div className={cx('transition duration-300', active ? 'translate-y-2 opacity-100' : 'opacity-0')}>
          <img src="/images/onboarding/right-middle-float.png" alt="" className="w-1/2" />
        </div>
      </div>
    </div>
  );
};
