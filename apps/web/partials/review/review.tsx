'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';
import BoringAvatar from 'boring-avatars';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { diffWords } from 'diff';
import type { Change as Difference } from 'diff';
import pluralize from 'pluralize';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useWalletClient } from 'wagmi';

import { createFiltersFromGraphQLString } from '~/core/blocks-sdk/table';
import { Environment } from '~/core/environment';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { usePublish } from '~/core/hooks/use-publish';
import { API, Subgraph } from '~/core/io';
import { fetchColumns } from '~/core/io/fetch-columns';
import { Services } from '~/core/services';
import { useDiff } from '~/core/state/diff-store';
import { useStatusBar } from '~/core/state/status-bar-store';
import { TableBlockFilter } from '~/core/state/table-block-store';
import type { Action as ActionType, Entity as EntityType, Space, Triple } from '~/core/types';
import { Action } from '~/core/utils/action';
import { Change } from '~/core/utils/change';
import type { AttributeChange, AttributeId, BlockChange, BlockId, Changeset } from '~/core/utils/change/change';
import { Entity } from '~/core/utils/entity';
import { GeoDate, getImagePath, sleepWithCallback } from '~/core/utils/utils';

import { Button, SmallButton, SquareButton } from '~/design-system/button';
import { Dropdown } from '~/design-system/dropdown';
import { Blank } from '~/design-system/icons/blank';
import { Close } from '~/design-system/icons/close';
import { Dash } from '~/design-system/icons/dash';
import { Minus } from '~/design-system/icons/minus';
import { Tick } from '~/design-system/icons/tick';
import { Trash } from '~/design-system/icons/trash';
import { SlideUp } from '~/design-system/slide-up';
import { Spacer } from '~/design-system/spacer';
import { colors } from '~/design-system/theme/colors';

import { TableBlockPlaceholder } from '~/partials/blocks/table/table-block';

export const Review = () => {
  const { isReviewOpen, setIsReviewOpen } = useDiff();

  return (
    <SlideUp isOpen={isReviewOpen} setIsOpen={setIsReviewOpen}>
      <ReviewChanges />
    </SlideUp>
  );
};

type SpaceId = string;
type Proposals = Record<SpaceId, Proposal>;

type Proposal = {
  name: string;
  description: string;
};

type EntityId = string;

const getImage = (triples: Triple[]) => {
  const cover = Entity.cover(triples);
  const avatar = Entity.avatar(triples);

  return cover ?? avatar;
};

type GatewaySpaceWithEntityConfig = {
  space: {
    spaceConfigEntityId: string;
  } & Space;
  isPermissionlessSpace: boolean;
};

const ReviewChanges = () => {
  const { subgraph } = Services.useServices();
  const { state } = useStatusBar();

  const { allSpacesWithActions } = useActionsStore();
  const { setIsReviewOpen, activeSpace, setActiveSpace } = useDiff();

  const { data: spaces, isLoading: isSpacesLoading } = useQuery({
    queryKey: ['spaces-in-review', allSpacesWithActions],
    queryFn: async () => {
      const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);
      const maybeSpaces = await Promise.all(allSpacesWithActions.map(s => API.space(s)));
      const spaces = maybeSpaces.filter(
        (s): s is GatewaySpaceWithEntityConfig => s.space !== null && s.space.spaceConfigEntityId !== null
      );

      const spaceConfigToSpaceMap = new Map<string, string>();

      for (const space of spaces) {
        spaceConfigToSpaceMap.set(space.space.spaceConfigEntityId, space.space.id);
      }

      const spaceConfigs = (
        await Promise.all(
          spaces.map(space =>
            subgraph.fetchEntity({
              endpoint: space.isPermissionlessSpace ? config.permissionlessSubgraph : config.subgraph,
              id: space.space.spaceConfigEntityId,
            })
          )
        )
      ).filter((c): c is EntityType => c !== null);

      const spacesMap = new Map<string, { id: string; name: string | null; image: string | null }>();

      for (const config of spaceConfigs) {
        const id = spaceConfigToSpaceMap.get(config.id);

        if (id) {
          const maybeImageHash = getImage(config.triples);
          const image = maybeImageHash ? getImagePath(maybeImageHash) : null;

          spacesMap.set(id, {
            id,
            name: config.name ?? null,
            image,
          });
        }
      }

      return spacesMap;
    },
  });

  // Set a new default active space when active spaces change
  useEffect(() => {
    if (
      allSpacesWithActions.length === 0 &&
      state.reviewState !== 'publish-complete' &&
      state.reviewState !== 'publishing-contract'
    ) {
      setIsReviewOpen(false);
      return;
    }
    setActiveSpace(allSpacesWithActions[0] ?? '');
  }, [allSpacesWithActions, setActiveSpace, setIsReviewOpen, state.reviewState]);

  // Options for space selector dropdown
  const options = allSpacesWithActions.map(spaceId => ({
    value: spaceId,
    label: (
      <span className="inline-flex items-center gap-2 text-button text-text">
        <span className="relative h-4 w-4 overflow-hidden rounded-sm">
          <img
            src={spaces?.get(spaceId)?.image ?? undefined}
            className="absolute inset-0 h-full w-full object-cover object-center"
            alt=""
          />
        </span>
        <span>{spaces?.get(spaceId)?.name}</span>
      </span>
    ),
    disabled: activeSpace === spaceId,
    onClick: () => setActiveSpace(spaceId),
  }));

  // Proposal state
  const { dispatch } = useStatusBar();
  const [proposals, setProposals] = useState<Proposals>({});
  const proposalName = proposals[activeSpace]?.name?.trim() ?? '';
  const isReadyToPublish = proposalName?.length > 3;
  const [unstagedChanges, setUnstagedChanges] = useState<Record<string, Record<string, boolean>>>({});
  const { actionsFromSpace, clear } = useActionsStore(activeSpace);
  const { makeProposal } = usePublish();
  const actions = Action.unpublishedChanges(actionsFromSpace);
  const [data, isLoading] = useChanges(actions, activeSpace);

  // Publishing logic
  const { data: wallet } = useWalletClient();

  const handlePublish = useCallback(async () => {
    if (!activeSpace || !wallet) return;

    const clearProposalName = () => {
      setProposals({ ...proposals, [activeSpace]: { name: '', description: '' } });
    };

    try {
      const [actionsToPublish] = Action.splitActions(actionsFromSpace, unstagedChanges);

      await makeProposal({
        actions: actionsToPublish,
        spaceId: activeSpace,
        name: proposalName,
        onChangePublishState: reviewState => dispatch({ type: 'SET_REVIEW_STATE', payload: reviewState }),
      });

      clearProposalName();
      dispatch({ type: 'SET_REVIEW_STATE', payload: 'publish-complete' });

      // want to show the "complete" state for 3s
      await sleepWithCallback(() => dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' }), 3000);
    } catch (e: unknown) {
      if (e instanceof Error) {
        if (e.message.startsWith('Publish failed: TransactionExecutionError: User rejected the request.')) {
          dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
          return;
        }

        dispatch({ type: 'ERROR', payload: e.message });
      }
    }
  }, [activeSpace, proposalName, proposals, makeProposal, wallet, unstagedChanges, dispatch, actionsFromSpace]);

  if (isLoading || !data || isSpacesLoading) {
    return null;
  }

  const { changes, entities } = data;
  const totalChanges = getTotalChanges(changes as Record<string, Change.Changeset>);
  const totalEdits = getTotalEdits(changes, unstagedChanges);

  const changedEntityIds = Object.keys(changes);

  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white px-4 py-1 shadow-big md:px-4 md:py-3">
        <div className="inline-flex items-center gap-4">
          <SquareButton onClick={() => setIsReviewOpen(false)} icon={<Close />} />
          {allSpacesWithActions.length > 0 && (
            <div className="inline-flex items-center gap-2">
              <span className="text-metadataMedium leading-none">Review your edits in</span>
              {allSpacesWithActions.length === 1 && (
                <span className="inline-flex items-center gap-2 text-button text-text ">
                  <span className="relative h-4 w-4 overflow-hidden rounded-sm">
                    <img
                      src={spaces?.get(activeSpace)?.image ?? undefined}
                      className="absolute inset-0 h-full w-full object-cover object-center"
                      alt=""
                    />
                  </span>
                  <span>{spaces?.get(activeSpace)?.name}</span>
                </span>
              )}
              {allSpacesWithActions.length > 1 && (
                <Dropdown
                  trigger={
                    <span className="inline-flex items-center gap-2">
                      <span className="relative h-4 w-4 overflow-hidden rounded-sm">
                        <img
                          src={spaces?.get(activeSpace)?.image ?? undefined}
                          className="absolute inset-0 h-full w-full object-cover object-center"
                          alt=""
                        />
                      </span>
                      <span>{spaces?.get(activeSpace)?.name}</span>
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
      <div className="mt-3 h-full overflow-y-auto overscroll-contain rounded-t-[32px] bg-bg shadow-big">
        <div className="mx-auto max-w-[1200px] pb-20 pt-10 xl:pb-[4ch] xl:pl-[2ch] xl:pr-[2ch] xl:pt-[40px]">
          <div className="relative flex flex-col gap-16">
            <div className="absolute right-0 top-0 flex items-center gap-8">
              <div className="inline-flex items-center gap-2">
                <span>
                  <span className="font-medium">
                    {totalEdits} {pluralize('edit', totalEdits)}
                  </span>{' '}
                  selected to publish
                </span>
                <SquareButton
                  icon={totalEdits === 0 ? <Blank /> : totalEdits === totalChanges ? <Tick /> : <Dash />}
                  onClick={() => setUnstagedChanges({})}
                />
              </div>
              <div>
                <SmallButton onClick={() => clear(activeSpace)}>Delete all</SmallButton>
              </div>
            </div>
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
            <div className="flex flex-col gap-16 divide-y divide-grey-02">
              {changedEntityIds.map((entityId: EntityId) => (
                <ChangedEntity
                  key={entityId}
                  spaceId={activeSpace}
                  change={changes[entityId] as Changeset}
                  entityId={entityId}
                  entity={entities[entityId] as EntityType}
                  unstagedChanges={unstagedChanges}
                  setUnstagedChanges={setUnstagedChanges}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const getTotalChanges = (changes: Record<string, Change.Changeset>) => {
  let totalChanges = 0;

  for (const key in changes) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    for (const _ in changes[key]?.attributes) {
      totalChanges++;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    for (const _ in changes[key]?.blocks) {
      totalChanges++;
    }
  }

  return totalChanges;
};

const getTotalEdits = (
  changes: Record<string, Change.Changeset>,
  unstagedChanges: Record<string, Record<string, boolean>>
) => {
  let totalEdits = 0;

  for (const key in changes) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    for (const _ in changes[key]?.attributes) {
      totalEdits++;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    for (const _ in changes[key]?.blocks) {
      totalEdits++;
    }
  }

  for (const key in unstagedChanges) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    for (const _ in unstagedChanges[key]) {
      totalEdits--;
    }
  }

  return totalEdits;
};

type ChangedEntityProps = {
  spaceId: SpaceId;
  change: Changeset;
  entityId: EntityId;
  entity: EntityType;
  unstagedChanges: Record<string, Record<string, boolean>>;
  setUnstagedChanges: (value: Record<string, Record<string, boolean>>) => void;
};

const ChangedEntity = ({
  spaceId,
  change,
  entityId,
  entity,
  unstagedChanges,
  setUnstagedChanges,
}: ChangedEntityProps) => {
  const { name, blocks = {}, attributes = {}, actions = [] } = change;

  const { deleteActions } = useActionsStore(spaceId);

  const handleDeleteActions = useCallback(() => {
    deleteActions(spaceId, actions);
  }, [spaceId, actions, deleteActions]);

  const blockIds = Object.keys(blocks);
  const attributeIds = Object.keys(attributes);

  let renderedName = name;

  if (!renderedName) {
    attributeIds.forEach(attributeId => {
      const attribute = attributes[attributeId];

      if (attribute.name === 'Name' && typeof attribute.after === 'string') {
        renderedName = attribute.after;
      }
    });
  }

  return (
    <div className="relative -top-12 pt-12">
      <div className="flex flex-col gap-5">
        <div className="text-mediumTitle">{renderedName}</div>
        <div className="flex gap-8">
          <div className="flex-1 text-body">Current version</div>
          <div className="relative flex-1 text-body">
            Your proposed edits
            <div className="absolute right-0 top-0">
              <SmallButton onClick={handleDeleteActions}>Delete all</SmallButton>
            </div>
          </div>
        </div>
      </div>
      {blockIds.length > 0 && (
        <div className="mt-4">
          {blockIds.map((blockId: BlockId) => (
            <ChangedBlock key={blockId} blockId={blockId} block={blocks[blockId]} />
          ))}
        </div>
      )}
      {attributeIds.length > 0 && (
        <div className="mt-2">
          {attributeIds.map((attributeId: AttributeId) => (
            <ChangedAttribute
              key={attributeId}
              spaceId={spaceId}
              attributeId={attributeId}
              attribute={attributes[attributeId]}
              entityId={entityId}
              entity={entity}
              unstagedChanges={unstagedChanges}
              setUnstagedChanges={setUnstagedChanges}
            />
          ))}
        </div>
      )}
    </div>
  );
};

type ChangedBlockProps = {
  blockId: BlockId;
  block: BlockChange;
};

const ChangedBlock = ({ blockId, block }: ChangedBlockProps) => {
  const { before, after } = block;

  // Don't show dead changes
  if (!before && !after) return null;

  switch (block.type) {
    case 'markdownContent': {
      const { markdownType: beforeMarkdownType, markdownContent: beforeMarkdownContent } = parseMarkdown(before ?? '');
      const { markdownType: afterMarkdownType, markdownContent: afterMarkdownContent } = parseMarkdown(after ?? '');

      const differences = diffWords(beforeMarkdownContent, afterMarkdownContent);

      const BeforeComponent = beforeMarkdownType;
      const AfterComponent = afterMarkdownType;

      return (
        <div key={blockId} className="flex gap-8">
          <div className="ProseMirror flex-1 py-4">
            <BeforeComponent>
              {differences
                .filter(item => !item.added)
                .map((difference: Difference, index: number) => (
                  <span key={index} className={cx(difference.removed && 'bg-errorTertiary line-through')}>
                    {difference.value}
                  </span>
                ))}
            </BeforeComponent>
          </div>
          <div className="ProseMirror flex-1 py-4">
            <AfterComponent>
              {differences
                .filter(item => !item.removed)
                .map((difference: Difference, index: number) => (
                  <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
                    {difference.value}
                  </span>
                ))}
            </AfterComponent>
          </div>
        </div>
      );
    }
    case 'imageBlock': {
      return (
        <div key={blockId} className="flex gap-8">
          <div className="flex-1 py-4">
            <div>
              {before && (
                <span className="inline-block rounded bg-errorTertiary p-1">
                  <img src={getImagePath(before)} className="rounded" />
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 py-4">
            <div>
              {after && (
                <span className="inline-block rounded bg-successTertiary p-1">
                  <img src={getImagePath(after)} className="rounded" />
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }
    case 'tableBlock': {
      const isNewTableBlock = before === null;
      const differences = diffWords(before ?? '', after ?? '');

      return (
        <div key={blockId} className="flex gap-8">
          <div className="flex-1 py-4">
            {!isNewTableBlock && (
              <>
                <div className="flex items-center gap-2">
                  <span className="overflow-hidden rounded">
                    <BoringAvatar
                      size={16}
                      square={true}
                      variant="bauhaus"
                      name={before ?? 'Untitled'}
                      colors={[colors.light['grey-03'], colors.light['grey-02'], colors.light['grey-01']]}
                    />
                  </span>
                  <div className="text-smallTitle">
                    {differences
                      .filter(item => !item.added)
                      .map((difference: Difference, index: number) => (
                        <span key={index} className={cx(difference.removed && 'bg-errorTertiary line-through')}>
                          {difference.value}
                        </span>
                      ))}
                  </div>
                </div>
                <TableBlockPlaceholder
                  columns={2}
                  rows={2}
                  className="mt-2 !overflow-hidden rounded border border-grey-02 p-0 opacity-50 shadow-button"
                />
              </>
            )}
          </div>
          <div className="flex-1 py-4">
            {after && (
              <>
                <div className="flex items-center gap-2">
                  <span className="overflow-hidden rounded">
                    <BoringAvatar
                      size={16}
                      square={true}
                      variant="bauhaus"
                      name={after ?? 'Untitled'}
                      colors={[colors.light['grey-03'], colors.light['grey-02'], colors.light['grey-01']]}
                    />
                  </span>
                  <div className="text-smallTitle">
                    {differences
                      .filter(item => !item.removed)
                      .map((difference: Difference, index: number) => (
                        <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
                          {difference.value}
                        </span>
                      ))}
                  </div>
                </div>
                <TableBlockPlaceholder
                  columns={2}
                  rows={2}
                  className="mt-2 !overflow-hidden rounded border border-grey-02 p-0 opacity-50 shadow-button"
                />
              </>
            )}
          </div>
        </div>
      );
    }
    case 'tableFilter': {
      const isNewTableFilter = before === null;

      return (
        <div key={blockId} className="flex gap-8">
          <div className="flex-1 py-4">
            {!isNewTableFilter && (
              <div className="flex flex-wrap gap-2">
                <TableFilters rawFilter={before} />
              </div>
            )}
          </div>
          <div className="flex-1 py-4">
            {after && (
              <div className="flex flex-wrap gap-2">
                <TableFilters rawFilter={after} />
              </div>
            )}
          </div>
        </div>
      );
    }
    default: {
      // required for <ChangedBlock /> to be valid JSX
      return <React.Fragment />;
    }
  }
};

type ChangedAttributeProps = {
  spaceId: SpaceId;
  attributeId: AttributeId;
  attribute: AttributeChange;
  entityId: EntityId;
  entity: EntityType;
  unstagedChanges: Record<string, Record<string, boolean>>;
  setUnstagedChanges: (value: Record<string, Record<string, boolean>>) => void;
};

const ChangedAttribute = ({
  spaceId,
  attributeId,
  attribute,
  entityId,
  entity,
  unstagedChanges,
  setUnstagedChanges,
}: ChangedAttributeProps) => {
  const { actions = [] } = attribute;

  const { deleteActions } = useActionsStore(spaceId);

  const handleDeleteActions = useCallback(() => {
    deleteActions(spaceId, actions);
  }, [spaceId, actions, deleteActions]);

  // Don't show page blocks
  if (attributeId === SYSTEM_IDS.BLOCKS) return null;

  const { name, before, after } = attribute;

  const unstaged = Object.hasOwn(unstagedChanges[entityId] ?? {}, attributeId);

  const handleStaging = () => {
    if (!unstaged) {
      setUnstagedChanges({
        ...unstagedChanges,
        [entityId]: {
          ...(unstagedChanges[entityId] ?? {}),
          [attributeId]: true,
        },
      });
    } else {
      const newUnstagedChanges: Record<string, Record<string, boolean>> = { ...unstagedChanges };
      if (newUnstagedChanges?.[entityId] && newUnstagedChanges?.[entityId]?.[attributeId]) {
        delete newUnstagedChanges?.[entityId]?.[attributeId];
      }
      setUnstagedChanges(newUnstagedChanges);
    }
  };

  // Don't show dead changes
  if (!before && !after) return null;

  switch (attribute.type) {
    case 'string': {
      const checkedBefore = typeof before === 'string' ? before : '';
      const checkedAfter = typeof after === 'string' ? after : '';
      const differences = diffWords(checkedBefore, checkedAfter);

      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="text-body">
              {differences
                .filter(item => !item.added)
                .map((difference: Difference, index: number) => (
                  <span key={index} className={cx(difference.removed && 'bg-errorTertiary line-through')}>
                    {difference.value}
                  </span>
                ))}
            </div>
          </div>
          <div className="group relative flex-1 border border-grey-02 p-4">
            <div className="absolute right-0 top-0 inline-flex items-center gap-4 p-4">
              <SquareButton
                onClick={handleDeleteActions}
                icon={<Trash />}
                className="opacity-0 group-hover:opacity-100"
              />
              <SquareButton onClick={handleStaging} icon={unstaged ? <Blank /> : <Tick />} />
            </div>
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="text-body">
              {differences
                .filter(item => !item.removed)
                .map((difference: Difference, index: number) => (
                  <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
                    {difference.value}
                  </span>
                ))}
            </div>
          </div>
        </div>
      );
    }
    case 'entity': {
      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="flex flex-wrap gap-2">
              {entity?.triples
                .filter((triple: any) => triple.attributeId === attributeId && !before?.includes(triple.value.name))
                .map((triple: any) => (
                  <Chip key={triple.id} status="unchanged">
                    {triple.value.name}
                  </Chip>
                ))}
              {Array.isArray(before) && (
                <>
                  {before.map(item => (
                    <Chip key={item} status="removed">
                      {before}
                    </Chip>
                  ))}
                </>
              )}
            </div>
          </div>
          <div className="group relative flex-1 border border-grey-02 p-4">
            <div className="absolute right-0 top-0 inline-flex items-center gap-4 p-4">
              <SquareButton
                onClick={handleDeleteActions}
                icon={<Trash />}
                className="opacity-0 group-hover:opacity-100"
              />
              <SquareButton onClick={handleStaging} icon={unstaged ? <Blank /> : <Tick />} />
            </div>
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="flex flex-wrap gap-2">
              {entity?.triples
                .filter(
                  (triple: any) =>
                    triple.attributeId === attributeId &&
                    !before?.includes(triple.value.name) &&
                    !after?.includes(triple.value.name)
                )
                .map((triple: any) => (
                  <Chip key={triple.id} status="unchanged">
                    {triple.value.name}
                  </Chip>
                ))}
              {Array.isArray(after) && (
                <>
                  {after.map(item => (
                    <Chip key={item} status="added">
                      {item}
                    </Chip>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      );
    }
    case 'image': {
      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div>
              {typeof before !== 'object' && (
                <span className="inline-block rounded bg-errorTertiary p-1">
                  <img src={getImagePath(before)} className="rounded" />
                </span>
              )}
            </div>
          </div>
          <div className="group relative flex-1 border border-grey-02 p-4">
            <div className="absolute right-0 top-0 inline-flex items-center gap-4 p-4">
              <SquareButton
                onClick={handleDeleteActions}
                icon={<Trash />}
                className="opacity-0 group-hover:opacity-100"
              />
              <SquareButton onClick={handleStaging} icon={unstaged ? <Blank /> : <Tick />} />
            </div>
            <div className="text-bodySemibold capitalize">{name}</div>
            <div>
              {typeof after !== 'object' && (
                <span className="inline-block rounded bg-successTertiary p-1">
                  <img src={getImagePath(after)} className="rounded" />
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }
    case 'date': {
      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="text-body">
              {before && <DateTimeDiff mode="before" before={before as string | null} after={after as string | null} />}
            </div>
          </div>
          <div className="group relative flex-1 border border-grey-02 p-4">
            <div className="absolute right-0 top-0 inline-flex items-center gap-4 p-4">
              <SquareButton
                onClick={handleDeleteActions}
                icon={<Trash />}
                className="opacity-0 group-hover:opacity-100"
              />
              <SquareButton onClick={handleStaging} icon={unstaged ? <Blank /> : <Tick />} />
            </div>
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="text-body">
              {after && <DateTimeDiff mode="after" before={before as string | null} after={after as string | null} />}
            </div>
          </div>
        </div>
      );
    }
    case 'url': {
      const checkedBefore = typeof before === 'string' ? before : '';
      const checkedAfter = typeof after === 'string' ? after : '';
      const differences = diffWords(checkedBefore, checkedAfter);

      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="truncate text-ctaPrimary no-underline">
              {differences
                .filter(item => !item.added)
                .map((difference: Difference, index: number) => (
                  <span key={index} className={cx(difference.removed && 'bg-errorTertiary line-through')}>
                    {difference.value}
                  </span>
                ))}
            </div>
          </div>
          <div className="group relative flex-1 border border-grey-02 p-4">
            <div className="absolute right-0 top-0 inline-flex items-center gap-4 p-4">
              <SquareButton
                onClick={handleDeleteActions}
                icon={<Trash />}
                className="opacity-0 group-hover:opacity-100"
              />
              <SquareButton onClick={handleStaging} icon={unstaged ? <Blank /> : <Tick />} />
            </div>
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="truncate text-ctaPrimary no-underline">
              {differences
                .filter(item => !item.removed)
                .map((difference: Difference, index: number) => (
                  <span key={index} className={cx(difference.added && 'bg-successTertiary')}>
                    {difference.value}
                  </span>
                ))}
            </div>
          </div>
        </div>
      );
    }
    default: {
      // required for <ChangedAttribute /> to be valid JSX
      return <React.Fragment />;
    }
  }
};

type DateTimeProps = {
  mode: 'before' | 'after';
  before: string | null;
  after: string | null;
};

type DateTimeType = {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
};

export const DateTimeDiff = ({ mode, before, after }: DateTimeProps) => {
  let beforeDateTime = null;
  let afterDateTime = null;

  if (before) {
    beforeDateTime = GeoDate.fromISOStringUTC(before);
  }

  if (after) {
    afterDateTime = GeoDate.fromISOStringUTC(after);
  }

  const renderedDateTime: DateTimeType = (mode === 'before' ? beforeDateTime : afterDateTime) as DateTimeType;
  const highlightClassName = mode === 'before' ? 'bg-errorTertiary' : 'bg-successTertiary';

  return (
    <div className="flex items-start gap-4">
      <div className="flex w-[164px] gap-3">
        <div className="flex w-full flex-[2] flex-col">
          <p className={cx(beforeDateTime?.month !== afterDateTime?.month && highlightClassName, dateFieldClassNames)}>
            {renderedDateTime.month.padStart(2, '0')}
          </p>
          <span className={labelClassNames}>Month</span>
        </div>
        <span className="w-full flex-[1] pt-[3px] text-grey-02">/</span>
        <div className="flex flex-[2] flex-col items-center">
          <p className={cx(beforeDateTime?.day !== afterDateTime?.day && highlightClassName, dateFieldClassNames)}>
            {renderedDateTime.day.padStart(2, '0')}
          </p>
          <span className={labelClassNames}>Day</span>
        </div>
        <span className="flex-[1] pt-[3px] text-grey-02">/</span>
        <div className="flex w-full flex-[4] flex-col items-center">
          <p className={cx(beforeDateTime?.year !== afterDateTime?.year && highlightClassName, dateFieldClassNames)}>
            {renderedDateTime.year}
          </p>
          <span className={labelClassNames}>Year</span>
        </div>
      </div>
      <div className="flex items-center">
        <Minus color="grey-03" />
        <Spacer width={18} />
        <div className="flex items-center gap-1">
          <p className={cx(beforeDateTime?.hour !== afterDateTime?.hour && highlightClassName, timeClassNames)}>
            {renderedDateTime.hour.padStart(2, '0')}
          </p>
          <span>:</span>
          <p className={cx(beforeDateTime?.minute !== afterDateTime?.minute && highlightClassName, timeClassNames)}>
            {renderedDateTime.minute.padStart(2, '0')}
          </p>
        </div>
        <p
          className={cx(
            (!before || !after || Number(beforeDateTime?.hour) < 12 !== Number(afterDateTime?.hour) < 12) &&
              highlightClassName,
            'uppercase',
            timeClassNames
          )}
        >
          {Number(renderedDateTime.hour) < 12 ? 'am' : 'pm'}
        </p>
      </div>
    </div>
  );
};

const dateFieldClassNames = `w-full bg-transparent text-center text-body tabular-nums`;

const labelClassNames = `text-footnote text-grey-04`;

const timeClassNames = `w-[21px] tabular-nums bg-transparent p-0 m-0 text-body`;

const useChanges = (actions: Array<ActionType> = [], spaceId: string) => {
  const { subgraph, config } = Services.useServices();
  const { data, isLoading } = useQuery({
    queryKey: ['changes', spaceId, actions],
    queryFn: async () => Change.fromActions(Action.prepareActionsForPublishing(actions), subgraph, config),
  });

  return [data, isLoading] as const;
};

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
        removed: 'bg-errorTertiary line-through',
        unchanged: 'bg-white',
      },
    },
  }
);

const Chip = ({ status = 'unchanged', children }: ChipProps) => {
  return <span className={chip({ status })}>{children}</span>;
};

type MarkdownType = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

const markdownComponent: Record<number, MarkdownType> = {
  0: 'p',
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
};

// Parse raw markdown into basic formatting
// faster than rendering TipTap editor
function parseMarkdown(markdownString: string) {
  let markdownType: MarkdownType = 'p';
  let markdownContent = markdownString;
  let markdownLevel = 0;

  while (markdownContent.startsWith('#')) {
    markdownContent = markdownContent.substring(1);
    markdownLevel++;
  }

  markdownType = markdownComponent[markdownLevel];
  markdownContent = markdownContent.trim();

  return { markdownType, markdownContent };
}

function getSpaceImage(spaces: Space[], spaceId: string): string {
  return getImagePath(
    spaces.find(({ id }) => id === spaceId)?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ??
      'https://via.placeholder.com/600x600/FF00FF/FFFFFF'
  );
}

type TableFiltersProps = {
  rawFilter: string;
};

const TableFilters = ({ rawFilter }: TableFiltersProps) => {
  const [filters, isLoading] = useFilters(rawFilter);

  if (isLoading || !filters || filters.length === 0) return null;

  return (
    <>
      {filters.map((filter, index) => (
        <TableFilter key={index} filter={filter} />
      ))}
    </>
  );
};

type TableFilterProps = {
  filter: TableBlockFilter & { columnName: string };
};

const TableFilter = ({ filter }: TableFilterProps) => {
  const value = filter.valueType === 'entity' ? filter.valueName : filter.value;

  return (
    <div className="flex items-center gap-2 rounded bg-divider py-1 pl-2 pr-1 text-metadata">
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <path
          d="M9.12976 0L2.87024 0C1.6588 0 0.947091 1.36185 1.63876 2.35643L4.45525 6.40634C4.48438 6.44823 4.5 6.49804 4.5 6.54907L4.5 10.5C4.5 11.3284 5.17157 12 6 12C6.82843 12 7.5 11.3284 7.5 10.5L7.5 6.54907C7.5 6.49804 7.51562 6.44823 7.54475 6.40634L10.3612 2.35642C11.0529 1.36185 10.3412 0 9.12976 0Z"
          fill={colors.light['text']}
        />
      </svg>
      <div className="flex items-center gap-1">
        <span>{filter.columnName ?? `[ID]`} is</span>
        <span>·</span>
        <span>{value}</span>
      </div>
    </div>
  );
};

const useFilters = (rawFilter: string) => {
  const { subgraph, config } = Services.useServices();
  const { data, isLoading } = useQuery({
    queryKey: [`${rawFilter}`],
    queryFn: async () => getFilters(rawFilter, subgraph, config),
  });

  return [data, isLoading] as const;
};

const getFilters = async (rawFilter: string, subgraph: Subgraph.ISubgraph, config: Environment.AppConfig) => {
  const filters = await createFiltersFromGraphQLString(
    rawFilter,
    async id => await subgraph.fetchEntity({ id, endpoint: config.subgraph })
  );
  const serverColumns = await fetchColumns({
    params: { skip: 0, first: 0, filter: '', endpoint: config.subgraph },
    api: {
      fetchEntity: subgraph.fetchEntity,
      fetchTriples: subgraph.fetchTriples,
    },
  });
  const filtersWithColumnName = filters.map(f => {
    if (f.columnId === SYSTEM_IDS.NAME) {
      return {
        ...f,
        columnName: 'Name',
      };
    }
    return {
      ...f,
      columnName: Entity.name(serverColumns.find(c => c.id === f.columnId)?.triples ?? []) ?? '',
    };
  });

  return filtersWithColumnName;
};
