'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import * as Dialog from '@radix-ui/react-dialog';

import * as React from 'react';
import { useState } from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

import { useDeploySpace } from '~/core/hooks/use-deploy-space';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { EntityId } from '~/core/io/substream-schema';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelations, getValues } from '~/core/sync/use-store';
import { SpaceGovernanceType, SpaceType } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Close } from '~/design-system/icons/close';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import { Animation } from '~/partials/onboarding/dialog';
import { cloneEntityIntoSpace } from '~/partials/versions/clone-entity-into-space';

type Mode = 'convert' | 'duplicate';

type Step = 'select-type' | 'creating' | 'completed';

type EntityToSpaceDialogProps = {
  entityId: string;
  entityName: string;
  sourceSpaceId: string;
  mode: Mode;
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
  mode,
  open,
  onOpenChange,
}: EntityToSpaceDialogProps) {
  const router = useRouter();
  const { smartAccount } = useSmartAccount();
  const { deploy } = useDeploySpace();
  const { storage } = useMutate();

  const [step, setStep] = useState<Step>('select-type');
  const [showRetry, setShowRetry] = useState(false);
  const [selectedType, setSelectedType] = useState<SpaceType | null>(null);
  const [newSpaceId, setNewSpaceId] = useState<string>('');

  const address = smartAccount?.account.address;

  const title = mode === 'convert' ? 'Move to new space' : 'Copy to new space';

  const resetState = () => {
    setStep('select-type');
    setShowRetry(false);
    setSelectedType(null);
    setNewSpaceId('');
  };

  const deleteEntityFromSource = () => {
    const sourceValues = getValues({
      selector: value => value.entity.id === entityId && value.spaceId === sourceSpaceId,
    });

    const sourceRelations = getRelations({
      selector: relation => relation.fromEntity.id === entityId && relation.spaceId === sourceSpaceId,
    });

    const blocksRelations = sourceRelations.filter(r => r.type.id === SystemIds.BLOCKS);
    const blockIds = [...new Set(blocksRelations.map(r => r.toEntity.id))];

    const orphanedBlockIds = blockIds.filter(blockId => {
      const remainingRefs = getRelations({
        selector: r =>
          r.toEntity.id === blockId &&
          !(r.fromEntity.id === entityId && r.type.id === SystemIds.BLOCKS && r.spaceId === sourceSpaceId),
      });
      return remainingRefs.length === 0;
    });

    const allValuesToDelete = [...sourceValues];
    const relationIds = new Set<string>();
    const allRelationsToDelete: typeof sourceRelations = [];

    for (const r of [
      ...sourceRelations,
      ...getRelations({ selector: r => r.toEntity.id === entityId && r.spaceId === sourceSpaceId }),
    ]) {
      if (!relationIds.has(r.id)) {
        relationIds.add(r.id);
        allRelationsToDelete.push(r);
      }
    }

    for (const blockId of orphanedBlockIds) {
      allValuesToDelete.push(...getValues({ selector: v => v.entity.id === blockId }));
      for (const r of getRelations({
        selector: r => r.fromEntity.id === blockId || r.toEntity.id === blockId,
      })) {
        if (!relationIds.has(r.id)) {
          relationIds.add(r.id);
          allRelationsToDelete.push(r);
        }
      }
    }

    storage.values.deleteMany(allValuesToDelete);
    storage.relations.deleteMany(allRelationsToDelete);
  };

  const createSpace = async (spaceType: SpaceType) => {
    if (!address) return;

    try {
      setShowRetry(false);

      const spaceId = await deploy({
        type: spaceType,
        spaceName: entityName,
        governanceType: 'DAO',
        topicId: entityId,
      });

      if (!spaceId) {
        throw new Error('Creating space failed');
      }

      // Clone entity content from source space into the new space
      cloneEntityIntoSpace(entityId as EntityId, sourceSpaceId, spaceId, storage);

      // Delete entity from source space if converting
      if (mode === 'convert') {
        deleteEntityFromSource();
      }

      setNewSpaceId(spaceId);
      setStep('completed');
    } catch (error) {
      setShowRetry(true);
      console.error(error);
    }
  };

  const onSelectType = (spaceType: SpaceType) => {
    setSelectedType(spaceType);
    setStep('creating');
    createSpace(spaceType);
  };

  const onRetry = () => {
    if (selectedType) {
      createSpace(selectedType);
    }
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
          <Dialog.Description className="sr-only">
            {mode === 'convert' ? 'Move this entity into a new space' : 'Copy this entity into a new space'}
          </Dialog.Description>
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
                            {mode === 'convert'
                              ? 'Converting entity into a new space.'
                              : 'Duplicating entity into a new space.'}
                          </Text>
                          {!hasCompleted && (
                            <>
                              <Spacer height={32} />
                              {showRetry && (
                                <p className="mt-4 text-center text-smallButton">
                                  Space creation failed{' '}
                                  <button onClick={onRetry} className="text-ctaPrimary">
                                    Retry
                                  </button>
                                </p>
                              )}
                            </>
                          )}
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
