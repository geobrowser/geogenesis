import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import cx from 'classnames';
import { cva } from 'class-variance-authority';
import { useSigner } from 'wagmi';
import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { diffWords } from 'diff';
import type { Change as Difference } from 'diff';

import { Action as ActionNamespace } from '../action';
import { Button, SmallButton, SquareButton } from '~/modules/design-system/button';
import { Dropdown } from '~/modules/design-system/dropdown';
import { Spinner } from '~/modules/design-system/spinner';
import { useReview } from '~/modules/review';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { useActionsStore } from '../action';
import { useLocalStorage } from '../hooks/use-local-storage';
import { Services } from '../services';
import type { Action, CreateTripleAction, DeleteTripleAction, Entity, ReviewState, Space, Triple } from '../types';
import { A, pipe } from '@mobily/ts-belt';
import { Text } from '../design-system/text';

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
  const [proposalName, setProposalName] = useState<string>('');
  const isReadyToPublish = proposalName.length > 3;
  const [unstagedChanges, setUnstagedChanges] = useLocalStorage<Record<string, unknown>>('unstagedChanges', {});
  const { actionsFromSpace, publish } = useActionsStore(activeSpace);

  // const changes = useChanges(ActionNamespace.unpublishedChanges(actionsFromSpace));
  const changes = getRealChanges(actionsFromSpace);

  // Publishing logic
  const { data: signer } = useSigner();
  const handlePublish = async () => {
    if (!activeSpace || !signer) return;
    await publish(activeSpace, signer, setReviewState, unstagedChanges);
  };

  console.log('changes', changes);

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
            <div className="flex flex-col gap-2">
              <div className="text-body">Proposal name</div>
              <input
                type="text"
                value={proposalName}
                onChange={({ currentTarget }) => setProposalName(currentTarget.value)}
                placeholder="Describe your proposal..."
                className="bg-transparent text-3xl font-semibold text-text placeholder:text-grey-02 focus:outline-none"
              />
            </div>
            <div className="-mt-10 flex flex-col divide-y divide-grey-02">
              {Object.entries(changes).map(([entityId, changes]) => (
                <RevisedEntity
                  key={entityId}
                  spaceId={activeSpace}
                  entityId={entityId}
                  entityName={''}
                  entityRevisions={changes}
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

export type Changes = Record<EntityId, Change>;

type EntityId = string;
type Change = { entityName: EntityName; entityRevisions: EntityRevisions };

type EntityName = string;
type EntityRevisions = Record<AttributeId, EntityRevision>;

type AttributeId = string;
type EntityRevision = {
  id: string;
  attributeName: AttributeName;
  currentValue?: string;
  isDiff: boolean;
  before?: Before;
  after?: After;
  differences?: Array<Difference>;
};

type AttributeName = string;
type Before = string[];
type After = string[];

type TripleDiff =
  | {
      type: 'editTriple';
      entityId: EntityId;
      entityName: EntityName;
      attributeId: AttributeId;
      attributeName: AttributeName;
      before: Triple & {
        diff: Difference;
      };
      after: Triple & {
        diff: Difference;
      };
    }
  | {
      type: 'createTriple';
      entityId: EntityId;
      entityName: EntityName;
      attributeId: AttributeId;
      attributeName: AttributeName;
      before: null;
      after: Triple & {
        diff: string;
      };
    }
  | {
      type: 'deleteTriple';
      entityId: EntityId;
      entityName: EntityName;
      attributeId: AttributeId;
      attributeName: AttributeName;
      before: Triple & {
        diff: string;
      };
      after: null;
    };

function getRealChanges(actions: Array<Action>) {
  const squashedActions = pipe(actions, ActionNamespace.unpublishedChanges, ActionNamespace.squashChanges);

  // TODO: GroupBy entityId + attributeId
  const diffs = squashedActions
    .map((action: Action): TripleDiff | null => {
      switch (action.type) {
        case 'createTriple': {
          const actionValue = getActionValue(action);
          if (!actionValue) return null;

          return {
            type: 'createTriple',
            entityId: action.entityId,
            entityName: action.entityName ?? '',
            attributeId: action.attributeId,
            attributeName: action.attributeName ?? '',
            before: null,
            after: {
              diff: actionValue,
              ...action,
            },
          };
        }
        case 'editTriple': {
          const beforeActionValue = getActionValue(action.before);
          const afterActionValue = getActionValue(action.after);

          const diff = diffWords(beforeActionValue ?? '', afterActionValue ?? '');

          return {
            type: 'editTriple',
            entityId: action.after.entityId,
            entityName: action.after.entityName ?? '',
            attributeId: action.after.attributeId,
            attributeName: action.after.attributeName ?? '',
            before: {
              ...action.before,
              diff: diff[0],
            },
            after: {
              ...action.after,
              diff: diff[1],
            },
          };
        }
        case 'deleteTriple': {
          const actionValue = getActionValue(action);
          if (!actionValue) break;

          return {
            type: 'deleteTriple',
            entityId: action.entityId,
            entityName: action.entityName ?? '',
            attributeId: action.attributeId,
            attributeName: action.attributeName ?? '',
            before: {
              ...action,
              diff: actionValue,
            },
            after: null,
          };
        }
        default:
          return null;
      }

      return null;
    })
    .flatMap(d => (d ? [d] : []));

  return A.groupBy(diffs, t => t.entityId);
}

const getActionValue = (action: CreateTripleAction | DeleteTripleAction): string | null => {
  switch (action.value.type) {
    case 'number':
      return action.value.value;
    case 'string':
      return action.value.value;
    case 'entity':
      return action.value.name;
    case 'image':
      return action.value.value;
  }
};

const message: Record<ReviewState, string> = {
  idle: '',
  reviewing: '',
  'publishing-ipfs': 'Uploading changes to IPFS',
  'signing-wallet': 'Sign your transaction',
  'publishing-contract': 'Adding your changes to the blockchain',
  'publish-complete': 'Changes published!',
};

const publishingStates: Array<ReviewState> = ['publishing-ipfs', 'publishing-contract'];

type RevisedEntityProps = {
  spaceId: string;
  entityId: string;
  entityName: EntityName;
  entityRevisions: TripleDiff[];
  unstagedChanges: Record<string, unknown>;
  setUnstagedChanges: (value: Record<string, unknown>) => void;
};

const RevisedEntity = ({
  spaceId,
  entityId,
  entityName,
  entityRevisions,
  unstagedChanges,
  setUnstagedChanges,
}: RevisedEntityProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [renderedEntityName, setRenderedEntityName] = useState<string>(() => entityName || 'Loading...');
  const { deleteActions } = useActionsStore(spaceId);
  const { network } = Services.useServices();

  useEffect(() => {
    async function fetchRemoteEntity() {
      const newEntity = await network.fetchEntity(entityId);
      const newEntityName = renderedEntityName !== 'Loading...' ? renderedEntityName : newEntity?.name ?? 'Not found';
      setRenderedEntityName(newEntityName);
      setEntity(newEntity);
      setIsLoading(false);
    }

    fetchRemoteEntity();
  }, [entityId, network, renderedEntityName]);

  const handleDeleteEdits = () => {
    const allActions = Object.values(entityRevisions).map(item => item.after.id);
    deleteActions(spaceId, allActions);
  };

  const beforeValueToDiff = (diff: TripleDiff) => {
    switch (diff.type) {
      case 'createTriple':
        return null;
      case 'editTriple':
        switch (diff.before.value.type) {
          case 'string':
            return (
              <TextChange status="removed">
                <Text key={`string-${diff.attributeId}-${diff.before.value.id}-${diff.before.id}`} as="p">
                  {diff.before.diff.value}
                </Text>
              </TextChange>
            );
          case 'entity':
            return <Chip status="removed">{diff.before.diff.value}</Chip>;
          case 'number':
            return null;
          case 'image':
            return (
              <TextChange status="removed">
                <Text key={`string-${diff.attributeId}-${diff.before.value.id}-${diff.before.id}`} as="p">
                  {diff.before.diff.value}
                </Text>
              </TextChange>
            );
        }
        break;
      case 'deleteTriple':
        switch (diff.before.value.type) {
          case 'string':
            return (
              <TextChange status="removed">
                <Text key={`string-${diff.attributeId}-${diff.before.value.id}-${diff.before.id}`} as="p">
                  {diff.before.diff}
                </Text>
              </TextChange>
            );
          case 'entity':
            return <Chip status="removed">{diff.before.diff}</Chip>;
          case 'number':
            return null;
          case 'image':
            return (
              <TextChange status="removed">
                <Text key={`string-${diff.attributeId}-${diff.before.value.id}-${diff.before.id}`} as="p">
                  {diff.before.diff}
                </Text>
              </TextChange>
            );
        }
    }
  };

  const afterValueToDiff = (diff: TripleDiff) => {
    switch (diff.type) {
      case 'createTriple':
        return null;
      case 'editTriple':
        switch (diff.after.value.type) {
          case 'string':
            return (
              <>
                <TextChange status="added">
                  <Text key={`string-${diff.attributeId}-${diff.after.value.id}-${diff.before.id}`} as="p">
                    {diff.after.diff.value}
                  </Text>
                </TextChange>
                <div className="absolute right-0 top-0 m-4 inline-flex items-center gap-2">
                  <SquareButton icon="trash" onClick={() => deleteActions(spaceId, [diff.after.id])} />
                  <SquareButton
                    icon={diff.after.id in unstagedChanges ? 'blank' : 'tick'}
                    onClick={() => changeStageForChange(diff.after.id)}
                  />
                </div>
              </>
            );
          case 'entity':
            return (
              <>
                <Chip status="added">{diff.after.diff.value}</Chip>
                <div className="absolute right-0 top-0 m-4 inline-flex items-center gap-2">
                  <SquareButton icon="trash" onClick={() => deleteActions(spaceId, [diff.after.id])} />
                  <SquareButton
                    icon={diff.after.id in unstagedChanges ? 'blank' : 'tick'}
                    onClick={() => changeStageForChange(diff.after.id)}
                  />
                </div>
              </>
            );
          case 'number':
            return null;
          case 'image':
            return (
              <>
                <TextChange status="added">
                  <Text key={`string-${diff.attributeId}-${diff.after.value.id}-${diff.after.id}`} as="p">
                    {diff.after.diff.value}
                  </Text>
                </TextChange>
                <div className="absolute right-0 top-0 m-4 inline-flex items-center gap-2">
                  <SquareButton icon="trash" onClick={() => deleteActions(spaceId, [diff.after.id])} />
                  <SquareButton
                    icon={diff.after.id in unstagedChanges ? 'blank' : 'tick'}
                    onClick={() => changeStageForChange(diff.after.id)}
                  />
                </div>
              </>
            );
        }
        break;
      case 'deleteTriple':
        switch (diff.before.value.type) {
          case 'string':
            return (
              <TextChange status="removed">
                <Text key={`string-${diff.attributeId}-${diff.before.value.id}-${diff.before.id}`} as="p">
                  {diff.before.diff}
                </Text>
              </TextChange>
            );
          case 'entity':
            return <Chip status="removed">{diff.before.diff}</Chip>;
          case 'number':
            return null;
          case 'image':
            return (
              <TextChange status="removed">
                <Text key={`string-${diff.attributeId}-${diff.before.value.id}-${diff.before.id}`} as="p">
                  {diff.before.diff}
                </Text>
              </TextChange>
            );
        }
    }
  };

  function changeStageForChange(id: string) {
    if (id in unstagedChanges) {
      const newUnstagedChanges = { ...unstagedChanges };
      delete newUnstagedChanges[id];
      setUnstagedChanges({ ...newUnstagedChanges });
    } else {
      setUnstagedChanges({ ...unstagedChanges, [id]: null });
    }
  }

  const groupedTriples = A.groupBy(entityRevisions, triple => triple.attributeId);

  // const groupedUnchangedEntityTriples = A.groupBy(
  //   entity?.triples.filter(t => !(t.attributeId in groupedTriples)) ?? [],
  //   triple => triple.attributeId
  // );

  return (
    <div className="flex flex-col gap-4 py-10">
      <div className="-mt-1 text-mediumTitle">{renderedEntityName}</div>
      <div className="grid grid-cols-2 items-start gap-8">
        <div className="flex flex-col gap-2">
          <div className="text-body">Current version</div>
          <Panel>
            <Panel.Section key={entityId}>
              {isLoading ? (
                <Skeleton />
              ) : (
                <>
                  {/* @TODO: Merge in remote entity */}
                  <div className="flex flex-col gap-2">
                    {Object.entries(groupedTriples).map(([attributeId, triples], index) => (
                      <div key={`${entityId}-${attributeId}-${index}`} className="break-words">
                        <Text as="p" variant="bodySemibold">
                          {triples[0].attributeName || attributeId}
                        </Text>
                        <div className="flex flex-wrap gap-2">{triples.map(beforeValueToDiff)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Panel.Section>
          </Panel>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-body">Your proposed edits</div>
            <SmallButton onClick={handleDeleteEdits}>Delete edits</SmallButton>
          </div>
          <Panel>
            <Panel.Section key={entityId}>
              <div className="flex flex-col gap-2">
                {Object.entries(groupedTriples).map(([attributeId, triples], index) => (
                  <div key={`${entityId}-${attributeId}-${index}`} className="relative break-words">
                    <Text as="p" variant="bodySemibold">
                      {triples[0].attributeName || attributeId}
                    </Text>
                    <div className="flex flex-wrap gap-2">{triples.map(afterValueToDiff)}</div>
                  </div>
                ))}
              </div>
            </Panel.Section>
          </Panel>
        </div>
      </div>
    </div>
  );
};

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
    <div className="divide-y divide-grey-02/75 overflow-hidden rounded border border-grey-02/75 bg-white shadow-light">
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

const Chip = ({ status = 'unchanged', children }: ChipProps) => {
  return <span className={chip({ status })}>{children}</span>;
};

type TextProps = {
  status?: 'added' | 'removed' | 'unchanged';
  children: React.ReactNode;
};

const text = cva('', {
  variants: {
    status: {
      added: 'bg-successTertiary',
      removed: 'bg-grey-02 line-through',
      unchanged: 'bg-white',
    },
  },
});

const TextChange = ({ status = 'unchanged', children }: TextProps) => {
  return <span className={text({ status })}>{children}</span>;
};

function getSpaceImage(spaces: Space[], spaceId: string): string {
  return (
    spaces.find(({ id }) => id === spaceId)?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ??
    'https://via.placeholder.com/600x600/FF00FF/FFFFFF'
  );
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
