'use client';

import * as Dialog from '@radix-ui/react-dialog';

import * as React from 'react';
import { useState } from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

import { useDeploySpace } from '~/core/hooks/use-deploy-space';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { EntityId } from '~/core/io/substream-schema';
import { useReportError } from '~/core/state/status-bar-store';
import { useMutate } from '~/core/sync/use-mutate';
import { SpaceGovernanceType, SpaceType } from '~/core/types';
import { describeError } from '~/core/utils/error-diagnostics';
import { NavUtils } from '~/core/utils/utils';

import { SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Close } from '~/design-system/icons/close';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import { Animation } from '~/partials/onboarding/dialog';
import { cloneEntityIntoSpace } from '~/partials/versions/clone-entity-into-space';

type Step = 'select-type' | 'creating' | 'completed';

type EntityToSpaceDialogProps = {
  entityId: string;
  entityName: string;
  sourceSpaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const spaceTypeOptions: { image: string; label: string; value: SpaceType; governance: SpaceGovernanceType }[] = [
  { image: '/images/onboarding/blank.png', label: 'Blank', value: 'default', governance: 'DAO' },
  {
    image: '/images/onboarding/academic-field.png',
    label: 'Academic field',
    value: 'academic-field',
    governance: 'DAO',
  },
  { image: '/images/onboarding/company.png', label: 'Company', value: 'company', governance: 'DAO' },
  { image: '/images/onboarding/dao.png', label: 'DAO', value: 'dao', governance: 'DAO' },
  { image: '/images/onboarding/gov-org.png', label: 'Government org', value: 'government-org', governance: 'DAO' },
  { image: '/images/onboarding/industry.png', label: 'Industry', value: 'industry', governance: 'DAO' },
  { image: '/images/onboarding/interest-group.png', label: 'Interest', value: 'interest', governance: 'DAO' },
  { image: '/images/onboarding/region.png', label: 'Region', value: 'region', governance: 'DAO' },
  { image: '/images/onboarding/nonprofit.png', label: 'Nonprofit', value: 'nonprofit', governance: 'DAO' },
  { image: '/images/onboarding/protocol.png', label: 'Protocol', value: 'protocol', governance: 'DAO' },
];

export function EntityToSpaceDialog({
  entityId,
  entityName,
  sourceSpaceId,
  open,
  onOpenChange,
}: EntityToSpaceDialogProps) {
  const router = useRouter();
  const { smartAccount } = useSmartAccount();
  const { deploy } = useDeploySpace();
  const { storage } = useMutate();
  const reportError = useReportError();

  const [step, setStep] = useState<Step>('select-type');
  const [newSpaceId, setNewSpaceId] = useState<string>('');

  const address = smartAccount?.account.address;

  const title = 'Copy to new space';

  const resetState = () => {
    setStep('select-type');
    setNewSpaceId('');
  };

  const createSpace = async (spaceType: SpaceType) => {
    if (!address) return;

    try {
      const spaceId = await deploy({
        type: spaceType,
        spaceName: entityName,
        governanceType: 'DAO',
        topicId: entityId,
      });

      if (!spaceId) {
        throw new Error('Creating space failed');
      }

      cloneEntityIntoSpace(entityId as EntityId, sourceSpaceId, spaceId, storage);

      setNewSpaceId(spaceId);
      setStep('completed');
    } catch (error) {
      console.error(error);
      const message = describeError(error);
      // Send the user back to the type-selection step so they can pick again or retry.
      setStep('select-type');
      reportError(`Space creation failed: ${message}`, () => {
        setStep('creating');
        createSpace(spaceType);
      });
    }
  };

  const onSelectType = (spaceType: SpaceType) => {
    setStep('creating');
    createSpace(spaceType);
  };

  const hasCompleted = step === 'completed';

  if (hasCompleted && newSpaceId) {
    setTimeout(() => {
      onOpenChange(false);
      resetState();
      router.push(NavUtils.toSpace(newSpaceId));
    }, 3_600);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen && step !== 'creating') {
          resetState();
          onOpenChange(false);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          onEscapeKeyDown={e => {
            if (step === 'creating' || step === 'completed') e.preventDefault();
          }}
          onPointerDownOutside={e => {
            if (step === 'creating' || step === 'completed') e.preventDefault();
          }}
          onInteractOutside={e => {
            if (step === 'creating' || step === 'completed') e.preventDefault();
          }}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">Copy this entity into a new space</Dialog.Description>
          <div className="pointer-events-none fixed inset-0 z-100 flex h-full w-full items-start justify-center bg-grey-04/50">
            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ type: 'tween', ease: 'easeInOut', duration: 0.15 }}
                className="relative z-10 flex h-full w-full items-start justify-center"
              >
                <motion.div
                  key="card"
                  initial={{ opacity: 0, bottom: -5 }}
                  animate={{ opacity: 1, bottom: 0 }}
                  exit={{ opacity: 0, bottom: -5 }}
                  transition={{ ease: 'easeInOut', duration: 0.225 }}
                  className="pointer-events-auto relative z-100 mt-40 flex h-[440px] w-full max-w-[360px] flex-col overflow-hidden rounded-lg border border-grey-02 bg-white p-4 shadow-dropdown"
                >
                  {/* Header */}
                  <div className="relative z-20 flex items-center justify-between pb-2">
                    <div className="h-1 w-4" />
                    <h3 className="text-smallTitle">{step === 'select-type' ? title : ''}</h3>
                    {step === 'select-type' ? (
                      <Dialog.Close asChild>
                        <SquareButton icon={<Close color="grey-04" />} className="border-none! bg-transparent!" />
                      </Dialog.Close>
                    ) : (
                      <div className="h-1 w-4" />
                    )}
                  </div>

                  {/* Template selection */}
                  {step === 'select-type' && (
                    <motion.div
                      key="select-type"
                      initial={{ opacity: 0, right: -20 }}
                      animate={{ opacity: 1, left: 0, right: 0 }}
                      exit={{ opacity: 0, left: -20 }}
                      transition={{ ease: 'easeInOut', duration: 0.225 }}
                      className="relative flex grow flex-col"
                    >
                      <div className="mt-1 mb-3 text-center">
                        <Text as="p" variant="body" className="text-grey-04">
                          Creating space for <strong className="text-text">{entityName}</strong>
                        </Text>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                        {spaceTypeOptions.map(option => (
                          <button
                            key={option.value}
                            onClick={() => onSelectType(option.value)}
                            className="flex items-center gap-3 rounded-lg border border-divider bg-white py-2 pr-3 pl-2 transition-colors duration-150 ease-in-out hover:bg-divider"
                          >
                            <div className="size-8 shrink-0 overflow-clip rounded">
                              <img src={option.image} alt="" className="block h-full w-full object-cover" />
                            </div>
                            <div className="text-button">{option.label}</div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Creating / completed */}
                  {(step === 'creating' || step === 'completed') && (
                    <>
                      <motion.div
                        key="creating"
                        initial={{ opacity: 0, right: -20 }}
                        animate={{ opacity: 1, left: 0, right: 0 }}
                        exit={{ opacity: 0, left: -20 }}
                        transition={{ ease: 'easeInOut', duration: 0.225 }}
                        className="relative flex grow flex-col"
                      >
                        <div className="flex w-full flex-col items-center pt-3">
                          <Text as="h3" variant="bodySemibold" className={cx('mx-auto text-center text-2xl!')}>
                            {hasCompleted ? 'Finalizing details...' : 'Creating space...'}
                          </Text>
                          <Text as="p" variant="body" className="mx-auto mt-2 px-4 text-center text-base!">
                            Duplicating entity into a new space.
                          </Text>
                          {!hasCompleted && <Spacer height={32} />}
                        </div>
                      </motion.div>
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
                  )}
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
