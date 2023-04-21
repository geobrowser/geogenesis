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
  const [changes, isLoading] = useChanges(actions, activeSpace);

  // Publishing logic
  const { data: signer } = useSigner();
  const handlePublish = async () => {
    if (!activeSpace || !signer) return;
    await publish(activeSpace, signer, setReviewState, unstagedChanges, proposalName);
    setProposals({ ...proposals, [activeSpace]: { name: '', description: '' } });
  };

  if (isLoading || typeof changes !== 'object') {
    return null;
  }

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
              {/* {Object.keys(changes).map((key: string) => (
                <RevisedEntity
                  key={key}
                  spaceId={activeSpace}
                  entityId={key}
                  entityName={changes[key].entityName}
                  entityRevisions={changes[key].entityRevisions}
                  blockRevisions={changes[key].blockRevisions}
                  unstagedChanges={unstagedChanges}
                  setUnstagedChanges={setUnstagedChanges}
                />
              ))} */}
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

// export type Changes = Record<EntityId, ChangeType>;

// type EntityId = string;
// type ChangeType = {
//   entityName: EntityName;
//   entityRevisions?: EntityRevisions;
//   blockRevisions?: EntityRevisions;
// };

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

const useChanges = (actions: Array<ActionType>, spaceId: string) => {
  const { network } = Services.useServices();
  const { data: changes, isLoading } = useQuery({
    queryKey: [`${spaceId}-changes`],
    queryFn: async () => Change.fromActions(actions, network),
  });

  return [changes, isLoading];
};

// export const legacyGetChanges = async (actions: Array<ActionType>, network: INetwork): Promise<any> => {
//   const changes: any = {};
//   const parsedActions = Action.squashChanges(actions);

//   parsedActions.forEach((action: ActionType) => {
//     switch (action.type) {
//       case 'createTriple': {
//         const actionValue = Action.getName(action) ?? Action.getValue(action);
//         if (!actionValue) break;
//         changes[action.entityId] = {
//           ...changes[action.entityId],
//           entityName: action.entityName ?? '',
//           entityRevisions: {
//             ...changes[action.entityId]?.entityRevisions,
//             [action.attributeId]: {
//               ...changes[action.entityId]?.entityRevisions?.[action.attributeId],
//               id: action.id,
//               attributeName: action.attributeName ?? '',
//               isDiff: false,
//               after: [...(changes[action.entityId]?.entityRevisions?.[action.attributeId]?.after ?? []), actionValue],
//             },
//           },
//         };
//         break;
//       }
//       case 'editTriple': {
//         const beforeActionValue = Action.getName(action.before) ?? Action.getValue(action.before);
//         const afterActionValue = Action.getName(action.after) ?? Action.getValue(action.after);
//         if (!beforeActionValue || !afterActionValue) break;
//         changes[action.before.entityId] = {
//           ...changes[action.before.entityId],
//           entityName: (changes[action.before.entityId]?.entityName || action.before.entityName) ?? '',
//           entityRevisions: {
//             ...changes[action.before.entityId]?.entityRevisions,
//             [action.before.attributeId]: {
//               ...changes[action.before.entityId]?.entityRevisions?.[action.before.attributeId],
//               id: action.before.id,
//               attributeName: action.before.attributeName ?? '',
//               isDiff: true,
//               currentValue:
//                 changes[action.before.entityId]?.entityRevisions?.[action.before.attributeId]?.currentValue ??
//                 beforeActionValue,
//               differences: diffWords(
//                 changes[action.before.entityId]?.entityRevisions?.[action.before.attributeId]?.currentValue ??
//                   beforeActionValue,
//                 afterActionValue
//               ),
//             },
//           },
//         };
//         break;
//       }
//       case 'deleteTriple': {
//         const actionValue = Action.getName(action) ?? Action.getValue(action);
//         if (!actionValue) break;
//         changes[action.entityId] = {
//           ...changes[action.entityId],
//           entityName: action.entityName ?? '',
//           entityRevisions: {
//             ...changes[action.entityId]?.entityRevisions,
//             [action.attributeId]: {
//               ...changes[action.entityId]?.entityRevisions?.[action.attributeId],
//               id: action.id,
//               attributeName: action.attributeName ?? '',
//               isDiff: false,
//               before: [...(changes[action.entityId]?.entityRevisions?.[action.attributeId]?.before ?? []), actionValue],
//             },
//           },
//         };
//         break;
//       }
//     }
//   });
//   const blockTypes = ['Text Block', 'Image Block', 'Markdown Content'];
//   const blockEntities: Array<[string, string]> = [];
//   for await (const entityId of Object.keys(changes)) {
//     if (
//       changes[entityId] &&
//       changes[entityId]?.entityRevisions !== undefined &&
//       Object.keys(changes[entityId].entityRevisions ?? {}).length > 0
//     ) {
//       for await (const attributeId of Object.keys(changes[entityId].entityRevisions ?? {})) {
//         if (changes[entityId]?.entityRevisions?.[attributeId].attributeName === 'Parent Entity') {
//           const parentEntityId = changes[entityId]?.entityRevisions?.[attributeId].id.split(':').slice(-1)[0];
//           const childEntityId = entityId;
//           if (parentEntityId) {
//             blockEntities.push([parentEntityId, childEntityId]);
//           }
//         } else if (blockTypes.includes(changes[entityId]?.entityRevisions?.[attributeId]?.attributeName ?? '')) {
//           const fullEntity = await network.fetchEntity(entityId);
//           const parentEntityId = fullEntity?.triples
//             .find(triple => triple.attributeName === 'Parent Entity')
//             ?.id.split(':')
//             .slice(-1)[0];
//           const childEntityId = entityId;
//           if (parentEntityId) {
//             blockEntities.push([parentEntityId, childEntityId]);
//           }
//         }
//       }
//     }
//   }
//   blockEntities.forEach(([parentEntityId, childEntityId]) => {
//     changes[parentEntityId] = {
//       ...changes[parentEntityId],
//       blockRevisions: { ...changes[parentEntityId]?.blockRevisions, ...changes[childEntityId]?.entityRevisions },
//     };
//   });
//   blockEntities.forEach(([, childEntityId]) => {
//     delete changes[childEntityId];
//   });

//   return changes;
// };

const message: Record<ReviewState, string> = {
  idle: '',
  reviewing: '',
  'publishing-ipfs': 'Uploading changes to IPFS',
  'signing-wallet': 'Sign your transaction',
  'publishing-contract': 'Adding your changes to The Graph',
  'publish-complete': 'Changes published!',
};

const publishingStates: Array<ReviewState> = ['publishing-ipfs', 'signing-wallet', 'publishing-contract'];

type RevisedEntityProps = {
  spaceId: string;
  entityId: string;
  entityName: EntityName;
  entityRevisions?: EntityRevisions;
  blockRevisions?: EntityRevisions;
  unstagedChanges: Record<string, unknown>;
  setUnstagedChanges: (value: Record<string, unknown>) => void;
};

const RevisedEntity = ({
  spaceId,
  entityId,
  entityName,
  entityRevisions,
  blockRevisions,
  unstagedChanges,
  setUnstagedChanges,
}: RevisedEntityProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [entity, setEntity] = useState<EntityType | null>(null);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteEdits = () => {
    if (entityRevisions && Object.values(entityRevisions).length > 0) {
      const allActions = Object.values(entityRevisions).map(item => item.id);
      deleteActions(spaceId, allActions);
    }
  };

  const numberOfRows = getRows(entityRevisions, blockRevisions);

  return (
    <div className="flex flex-col gap-4 py-10">
      <div className="-mt-1 text-mediumTitle">{renderedEntityName}</div>
      <div
        className="grid w-full grid-flow-col grid-cols-2 items-start gap-8"
        style={{ gridTemplateRows: `repeat(${numberOfRows}, auto` }}
      >
        <div className="text-body">Current version</div>
        {blockRevisions &&
          Object.keys(blockRevisions).length > 0 &&
          Object.keys(blockRevisions).map(blockId => {
            if (blockId === 'type' || blockId === 'name') return null;

            const { attributeName, differences } = blockRevisions[blockId];

            return (
              <div key={attributeName} className="relative">
                <div className="text-body">
                  {differences
                    ?.filter(item => !item.added)
                    ?.map((difference: Difference, index: number) => (
                      <span key={index} className={cx(difference.removed && 'bg-grey-02 line-through')}>
                        {difference.value}
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        {entityRevisions && Object.keys(entityRevisions).length > 0 && (
          <Panel>
            {Object.keys(entityRevisions).map(attributeId => {
              if (attributeId === SYSTEM_IDS.BLOCKS) return null;

              const { attributeName, isDiff, before, differences } = entityRevisions[attributeId];

              return (
                <Panel.Section key={attributeId}>
                  <div className="text-bodySemibold">{attributeName}</div>
                  <div className={cx(!isDiff ? 'flex flex-wrap gap-1.5' : 'text-body')}>
                    {!isDiff ? (
                      <>
                        {isLoading ? (
                          <Skeleton />
                        ) : (
                          <>
                            {entity?.triples
                              ?.filter(
                                (item: any) => item.attributeId === attributeId && !before?.includes(item.value.name)
                              )
                              ?.map((triple: any) => (
                                <Chip key={triple.id} status="unchanged">
                                  {triple.value.name}
                                </Chip>
                              ))}
                          </>
                        )}
                        {before?.map(item => (
                          <Chip key={item} status="removed">
                            {item}
                          </Chip>
                        ))}
                      </>
                    ) : (
                      differences
                        ?.filter(item => !item.added)
                        ?.map((difference: Difference, index: number) => (
                          <span key={index} className={cx(difference.removed && 'bg-grey-02 line-through')}>
                            {difference.value}
                          </span>
                        ))
                    )}
                  </div>
                </Panel.Section>
              );
            })}
          </Panel>
        )}
        <div className="flex items-center justify-between">
          <div className="text-body">Your proposed edits</div>
          <SmallButton onClick={handleDeleteEdits}>Delete edits</SmallButton>
        </div>
        {blockRevisions &&
          Object.keys(blockRevisions).length > 0 &&
          Object.keys(blockRevisions).map(blockId => {
            if (blockId === 'type' || blockId === 'name') return null;

            const { id, differences } = blockRevisions[blockId];
            const unstaged = id in unstagedChanges;

            return (
              <div key={id} className="relative">
                <div className={cx('text-body', unstaged && 'opacity-25')}>
                  {differences
                    ?.filter(item => !item.removed)
                    ?.map((difference: Difference, index: number) => (
                      <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
                        {difference.value}
                      </span>
                    ))}
                </div>
                <div className="my-4 inline-flex items-center gap-2">
                  <SquareButton icon="trash" onClick={() => deleteActions(spaceId, [id])} />
                  <SquareButton
                    icon={unstaged ? 'blank' : 'tick'}
                    onClick={() => {
                      if (unstaged) {
                        const newUnstagedChanges = { ...unstagedChanges };
                        delete newUnstagedChanges[id];
                        setUnstagedChanges({ ...newUnstagedChanges });
                      } else {
                        setUnstagedChanges({ ...unstagedChanges, [id]: null });
                      }
                    }}
                  />
                </div>
              </div>
            );
          })}
        {entityRevisions && Object.keys(entityRevisions).length > 0 && (
          <Panel>
            {Object.keys(entityRevisions).map(attributeId => {
              if (attributeId === SYSTEM_IDS.BLOCKS) return null;

              const { id, attributeName, isDiff, before, after, differences } = entityRevisions[attributeId];
              const unstaged = id in unstagedChanges;

              return (
                <Panel.Section key={attributeId}>
                  <div className={cx('text-bodySemibold', unstaged && 'opacity-25')}>{attributeName}</div>
                  <div className={cx(!isDiff ? 'flex flex-wrap gap-1.5' : 'text-body', unstaged && 'opacity-25')}>
                    {!isDiff ? (
                      <>
                        {isLoading ? (
                          <Skeleton />
                        ) : (
                          <>
                            {entity?.triples
                              ?.filter(
                                (item: any) =>
                                  item.attributeId === attributeId &&
                                  !before?.includes(item.value.name) &&
                                  !after?.includes(item.value.name)
                              )
                              ?.map((triple: any) => (
                                <Chip key={triple.id} status="unchanged">
                                  {triple.value.name}
                                </Chip>
                              ))}
                          </>
                        )}
                        {before?.map(item => (
                          <Chip key={item} status="removed">
                            {item}
                          </Chip>
                        ))}
                        {after?.map(item => (
                          <Chip key={item} status="added">
                            {item}
                          </Chip>
                        ))}
                      </>
                    ) : (
                      differences
                        ?.filter(item => !item.removed)
                        ?.map((difference: Difference, index: number) => (
                          <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
                            {difference.value}
                          </span>
                        ))
                    )}
                  </div>
                  <div className="absolute right-0 top-0 m-4 inline-flex items-center gap-2">
                    <SquareButton icon="trash" onClick={() => deleteActions(spaceId, [id])} />
                    <SquareButton
                      icon={unstaged ? 'blank' : 'tick'}
                      onClick={() => {
                        if (unstaged) {
                          const newUnstagedChanges = { ...unstagedChanges };
                          delete newUnstagedChanges[id];
                          setUnstagedChanges({ ...newUnstagedChanges });
                        } else {
                          setUnstagedChanges({ ...unstagedChanges, [id]: null });
                        }
                      }}
                    />
                  </div>
                </Panel.Section>
              );
            })}
          </Panel>
        )}
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
