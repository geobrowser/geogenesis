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
import { SpaceType } from '~/core/types';
import { describeError } from '~/core/utils/error-diagnostics';
import { NavUtils } from '~/core/utils/utils';

import { Dots } from '~/design-system/dots';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import { Animation } from '~/partials/onboarding/dialog';
import { cloneEntityIntoSpace } from '~/partials/versions/clone-entity-into-space';

type Step = 'creating' | 'completed';

type EntityToSpaceDialogProps = {
  entityId: string;
  entityName: string;
  sourceSpaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// "Turn into space" clones the source entity's own blocks onto the home entity
const NEW_SPACE_TYPE: SpaceType = 'default';

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

  const [step, setStep] = useState<Step>('creating');
  const [newSpaceId, setNewSpaceId] = useState<string>('');

  const address = smartAccount?.account.address;

  const title = 'Turn into space';

  const resetState = () => {
    setStep('creating');
    setNewSpaceId('');
  };

  const createSpace = React.useCallback(async () => {
    if (!address) return;

    setStep('creating');

    try {
      const spaceId = await deploy({
        type: NEW_SPACE_TYPE,
        spaceName: entityName,
        governanceType: 'DAO',
        topicId: entityId,
        seedOverviewTemplate: false,
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
      resetState();
      onOpenChange(false);
      reportError(`Space creation failed: ${message}`, () => onOpenChange(true));
    }
  }, [address, deploy, entityName, entityId, sourceSpaceId, storage, reportError, onOpenChange]);

  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      startedRef.current = false;
      return;
    }
    if (startedRef.current || !address) return;
    startedRef.current = true;
    createSpace();
  }, [open, address, createSpace]);

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
        if (!nextOpen) return;
        onOpenChange(true);
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          onEscapeKeyDown={e => e.preventDefault()}
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">Turn this entity into a new space</Dialog.Description>
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
                    <h3 className="text-smallTitle" />
                    <div className="h-1 w-4" />
                  </div>

                  {/* Creating / completed */}
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
                        Turning entity into a new space.
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
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
