import * as React from 'react';
import { useState, useEffect } from 'react';
import cx from 'classnames';
import { cva } from 'class-variance-authority';
import { useSigner } from 'wagmi';
import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { diffWords } from 'diff';
import type { Change as Difference } from 'diff';
import { useQuery } from '@tanstack/react-query';

import { Action } from '../action';
import { Change } from '../change';
import { Button, SmallButton, SquareButton } from '~/modules/design-system/button';
import { Dropdown } from '~/modules/design-system/dropdown';
import { Spinner } from '~/modules/design-system/spinner';
import { useReview } from '~/modules/review';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { useActionsStore } from '../action';
import { useLocalStorage } from '../hooks/use-local-storage';
import { Services } from '../services';
import type { Action as ActionType, Entity as EntityType, ReviewState, Space } from '../types';
import type { INetwork } from '../io/data-source/network';
import type { Changes } from '../change';

export const Review = () => {
  const { isReviewOpen, setIsReviewOpen } = useReview();

  const onClose = () => {
    setIsReviewOpen(false);
  };

  return (
    <Dialog.Root open={isReviewOpen} onOpenChange={onClose} modal={true}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {isReviewOpen && (
            <Dialog.Content forceMount>
              <motion.div
                variants={reviewVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={transition}
                className={cx('fixed inset-0 z-100 h-full w-full bg-grey-02', !isReviewOpen && 'pointer-events-none')}
              >
                <ReviewChanges />
              </motion.div>
            </Dialog.Content>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

type SpaceId = string;
type Proposals = Record<SpaceId, Proposal>;

type Proposal = {
  name: string;
  description: string;
};

type EntityId = string;

const ReviewChanges = () => {
  const { spaces } = useSpaces();
  const { allSpacesWithActions } = useActionsStore();
  const { setIsReviewOpen, activeSpace, setActiveSpace } = useReview();

  // Set a new default active space when active spaces change
  useEffect(() => {
    if (allSpacesWithActions.length === 0) {
      setIsReviewOpen(false);
      return;
    }
    setActiveSpace(allSpacesWithActions[0] ?? '');
  }, [allSpacesWithActions, setActiveSpace, setIsReviewOpen]);

  // Options for space selector dropdown
  const options = allSpacesWithActions.map(spaceId => ({
    value: spaceId,
    label: (
      <span className="inline-flex items-center gap-2 text-button text-text ">
        <span className="relative h-4 w-4 overflow-hidden rounded-sm">
          <img
            src={getSpaceImage(spaces, spaceId)}
            className="absolute inset-0 h-full w-full object-cover object-center"
            alt=""
          />
        </span>
        <span>{spaces.find(({ id }) => id === spaceId)?.attributes.name}</span>
      </span>
    ),
    disabled: activeSpace === spaceId,
    onClick: () => setActiveSpace(spaceId),
  }));

  // Proposal state
  const [reviewState, setReviewState] = useState<ReviewState>('idle');
  const [proposals, setProposals] = useLocalStorage<Proposals>('proposals', {});
  const proposalName = proposals[activeSpace]?.name?.trim() ?? '';
  const isReadyToPublish = proposalName?.length > 3;
  const [unstagedChanges, setUnstagedChanges] = useLocalStorage<Record<string, unknown>>('unstagedChanges', {});
  const { actionsFromSpace, publish } = useActionsStore(activeSpace);
  const actions = Action.unpublishedChanges(actionsFromSpace);
  const [data, isLoading] = useChanges(actions, activeSpace);

  // Publishing logic
  const { data: signer } = useSigner();
  const handlePublish = async () => {
    if (!activeSpace || !signer) return;
    await publish(activeSpace, signer, setReviewState, unstagedChanges, proposalName);
    setProposals({ ...proposals, [activeSpace]: { name: '', description: '' } });
  };

  if (isLoading || typeof data !== 'object') {
    return null;
  }

  // @TODO render changes with supplemental entity data
  // render blocks, then attributes
  const [changes, entities] = data;

  const changedEntities = Object.keys(changes);

  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white py-1 px-4 shadow-big md:py-3 md:px-4">
        <div className="inline-flex items-center gap-4">
          <SquareButton onClick={() => setIsReviewOpen(false)} icon="close" />
          {allSpacesWithActions.length > 0 && (
            <div className="inline-flex items-center gap-2">
              <span className="text-metadataMedium leading-none">Review your edits in</span>
              {allSpacesWithActions.length === 1 && (
                <span className="inline-flex items-center gap-2 text-button text-text ">
                  <span className="relative h-4 w-4 overflow-hidden rounded-sm">
                    <img
                      src={getSpaceImage(spaces, activeSpace)}
                      className="absolute inset-0 h-full w-full object-cover object-center"
                      alt=""
                    />
                  </span>
                  <span>{spaces.find(({ id }) => id === activeSpace)?.attributes.name}</span>
                </span>
              )}
              {allSpacesWithActions.length > 1 && (
                <Dropdown
                  trigger={
                    <span className="inline-flex items-center gap-2">
                      <span className="relative h-4 w-4 overflow-hidden rounded-sm">
                        <img
                          src={getSpaceImage(spaces, activeSpace)}
                          className="absolute inset-0 h-full w-full object-cover object-center"
                          alt=""
                        />
                      </span>
                      <span>{spaces.find(({ id }) => id === activeSpace)?.attributes.name}</span>
                    </span>
                  }
                  align="start"
                  options={options}
                />
              )}
            </div>
          )}
        </div>
        <div>
          <Button onClick={handlePublish} disabled={!isReadyToPublish}>
            Publish
          </Button>
        </div>
      </div>
      <div className="mt-3 h-full overflow-y-auto overscroll-none rounded-t-[32px] bg-bg shadow-big">
        <div className="mx-auto max-w-[1200px] pt-10 pb-20 xl:pt-[40px] xl:pr-[2ch] xl:pb-[4ch] xl:pl-[2ch]">
          <div className="flex flex-col gap-16">
            <div className="flex flex-col">
              <div className="text-body">Proposal name</div>
              <input
                type="text"
                value={proposals[activeSpace]?.name ?? ''}
                onChange={({ currentTarget }) =>
                  setProposals({
                    ...proposals,
                    [activeSpace]: { ...proposals[activeSpace], name: currentTarget.value },
                  })
                }
                placeholder="Name your proposal..."
                className="bg-transparent text-3xl font-semibold text-text placeholder:text-grey-02 focus:outline-none"
              />
            </div>
            <div className="-mt-10 flex flex-col divide-y divide-grey-02">
              {changedEntities.map((entityId: EntityId) => (
                <ChangedEntity
                  key={entityId}
                  entityId={entityId}
                  change={changes[entityId]}
                  unstagedChanges={unstagedChanges}
                  setUnstagedChanges={setUnstagedChanges}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <StatusBar reviewState={reviewState} />
    </>
  );
};

type ChangedEntityProps = {
  entityId: EntityId;
  change: any;
  unstagedChanges: Record<string, unknown>;
  setUnstagedChanges: (value: Record<string, unknown>) => void;
};

const ChangedEntity = ({ entityId, change, unstagedChanges, setUnstagedChanges }: ChangedEntityProps) => {
  const { name, blocks = {}, attributes = {} } = change;

  const blockIds = Object.keys(blocks);
  const attributeIds = Object.keys(attributes);

  return (
    <div>
      <div className="text-mediumTitle">{name}</div>
      {blockIds.length > 0 && (
        <div>
          {blockIds.map(blockId => (
            <ChangedBlock key={blockId} blockId={blockId} block={blocks[blockId]} />
          ))}
        </div>
      )}
      {attributeIds.length > 0 && (
        <div>
          {attributeIds.map(attributeId => (
            <ChangedAttribute key={attributeId} attributeId={attributeId} attribute={attributes[attributeId]} />
          ))}
        </div>
      )}
    </div>
  );
};

type ChangedBlockProps = {
  blockId: string;
  block: any;
};

const ChangedBlock = ({ blockId, block }: ChangedBlockProps) => {
  const { before, after } = block;

  switch (block.type) {
    case 'markdownContent': {
      // @TODO run diff

      return (
        <div key={blockId} className="flex gap-8">
          <div className="flex-1  p-4">
            <div className="text-bodySemibold capitalize">{blockId}</div>
            <div>{before}</div>
          </div>
          <div className="flex-1  p-4">
            <div className="text-bodySemibold capitalize">{blockId}</div>
            <div>{after}</div>
          </div>
        </div>
      );
    }
    case 'imageBlock': {
      // @TODO get other entities from parent

      return (
        <div key={blockId} className="flex gap-8">
          <div className="flex-1  p-4">
            <div className="text-bodySemibold capitalize">{blockId}</div>
            <div>{before && <img src={before} />}</div>
          </div>
          <div className="flex-1 p-4">
            <div className="text-bodySemibold capitalize">{blockId}</div>
            <div>{after && <img src={after} />}</div>
          </div>
        </div>
      );
    }
    default: {
      return <></>;
    }
  }
};

type ChangedAttributeProps = {
  attributeId: string;
  attribute: any;
};

const ChangedAttribute = ({ attributeId, attribute }: ChangedAttributeProps) => {
  const { before, after } = attribute;

  switch (attribute.type) {
    case 'string': {
      // @TODO run diffs

      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{attributeId}</div>
            <div>{before}</div>
          </div>
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{attributeId}</div>
            <div>{after}</div>
          </div>
        </div>
      );
    }
    case 'entity': {
      // @TODO get other entities from parent
      // @TODO support multiple changes

      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{attributeId}</div>
            {before && <Chip status="removed">{before}</Chip>}
          </div>
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{attributeId}</div>
            <div>{after && <Chip status="added">{after}</Chip>}</div>
          </div>
        </div>
      );
    }
    case 'image': {
      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{attributeId}</div>
            <div>{before && <img src={before} />}</div>
          </div>
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{attributeId}</div>
            <div>{after && <img src={after} />}</div>
          </div>
        </div>
      );
    }
    default: {
      return <></>;
    }
  }
};

type StatusBarProps = {
  reviewState: ReviewState;
};

const StatusBar = ({ reviewState }: StatusBarProps) => {
  return (
    <AnimatePresence>
      {reviewState !== 'idle' && (
        <div className="fixed bottom-0 right-0 left-0 flex w-full justify-center">
          <motion.div
            variants={statusVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={transition}
            className="m-8 inline-flex items-center gap-2 rounded bg-text px-3 py-2.5 text-metadataMedium text-white"
          >
            {publishingStates.includes(reviewState) && <Spinner />}
            <span>{message[reviewState]}</span>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const useChanges = (actions: Array<ActionType>, spaceId: string) => {
  const { network } = Services.useServices();
  const { data, isLoading } = useQuery({
    queryKey: [`${spaceId}-changes`],
    queryFn: async () => Change.fromActions(actions, network),
  });

  return [data, isLoading];
};

const message: Record<ReviewState, string> = {
  idle: '',
  reviewing: '',
  'publishing-ipfs': 'Uploading changes to IPFS',
  'signing-wallet': 'Sign your transaction',
  'publishing-contract': 'Adding your changes to The Graph',
  'publish-complete': 'Changes published!',
};

const publishingStates: Array<ReviewState> = ['publishing-ipfs', 'signing-wallet', 'publishing-contract'];

const Skeleton = () => {
  return (
    <div className="inline-flex min-h-[1.5rem] items-center rounded-sm bg-white px-2 py-1 text-grey-04 shadow-inner shadow-text">
      Loading...
    </div>
  );
};

type PanelProps = {
  children: React.ReactNode;
};

const Panel = ({ children }: PanelProps) => {
  return (
    <div className="h-full divide-y divide-grey-02/75 overflow-hidden rounded border border-grey-02/75 bg-white shadow-light">
      {children}
    </div>
  );
};
Panel.Section = Section;

type SectionProps = {
  children: React.ReactNode;
};

function Section({ children }: SectionProps) {
  return <div className="relative p-4">{children}</div>;
}

type ChipProps = {
  status?: 'added' | 'removed' | 'unchanged';
  children: React.ReactNode;
};

const Chip = ({ status = 'unchanged', children }: ChipProps) => {
  const chip = cva(
    'inline-flex min-h-[1.5rem] items-center rounded-sm px-2 py-1 text-left text-metadataMedium shadow-inner shadow-text',
    {
      variants: {
        status: {
          added: 'bg-successTertiary',
          removed: 'bg-grey-02 line-through',
          unchanged: 'bg-white',
        },
      },
    }
  );

  return <span className={chip({ status })}>{children}</span>;
};

function getSpaceImage(spaces: Space[], spaceId: string): string {
  return (
    spaces.find(({ id }) => id === spaceId)?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ??
    'https://via.placeholder.com/600x600/FF00FF/FFFFFF'
  );
}

function getRows(entityRevisions?: EntityRevisions, blockRevisions?: EntityRevisions) {
  let rows = 1;
  if (entityRevisions) {
    rows = rows + 1;
  }
  if (blockRevisions) {
    rows = rows + Object.keys(blockRevisions).filter(id => id !== 'name' && id !== 'type').length;
  }
  return rows;
}

const reviewVariants = {
  hidden: { y: '100%' },
  visible: {
    y: '0%',
    transition: {
      type: 'spring',
      duration: 0.5,
      bounce: 0,
      delay: 0.5,
    },
  },
};

const statusVariants = {
  hidden: { opacity: 0, y: '4px' },
  visible: { opacity: 1, y: '0px' },
};

const transition = { type: 'spring', duration: 0.5, bounce: 0 };
