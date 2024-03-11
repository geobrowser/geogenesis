'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';
import BoringAvatar from 'boring-avatars';
import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { diffArrays, diffWords } from 'diff';
import type { Change as Difference } from 'diff';
import Link from 'next/link';
import pluralize from 'pluralize';

import * as React from 'react';

import { createFiltersFromGraphQLString } from '~/core/blocks-sdk/table';
import { Environment } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { fetchColumns } from '~/core/io/fetch-columns';
import { Services } from '~/core/services';
import { useDiff } from '~/core/state/diff-store';
import { TableBlockFilter } from '~/core/state/table-block-store';
import type { Action as ActionType, Proposal as ProposalType } from '~/core/types';
import { Action } from '~/core/utils/action';
import { Change } from '~/core/utils/change';
import type { AttributeChange, AttributeId, BlockChange, BlockId, Changeset } from '~/core/utils/change/change';
import { Entity } from '~/core/utils/entity';
import { formatShortAddress, getImagePath } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Button } from '~/design-system/button';
import { SlideUp } from '~/design-system/slide-up';
import { colors } from '~/design-system/theme/colors';

import { TableBlockPlaceholder } from '~/partials/blocks/table/table-block';

import { DateTimeDiff } from '../review/review';

export const Compare = () => {
  const { isCompareOpen, setIsCompareOpen } = useDiff();

  return (
    <SlideUp isOpen={isCompareOpen} setIsOpen={setIsCompareOpen}>
      <CompareChanges />
    </SlideUp>
  );
};

type SpaceId = string;
type EntityId = string;

const CompareChanges = () => {
  const { compareMode, setIsCompareOpen } = useDiff();

  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white px-4 py-1 shadow-big md:px-4 md:py-3">
        <div className="inline-flex items-center gap-4">Compare {compareMode}</div>
        <div>
          <Button variant="secondary" onClick={() => setIsCompareOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
      <div className="mt-3 h-full overflow-y-auto overscroll-contain rounded-t-[16px] bg-bg shadow-big">
        <div className="mx-auto max-w-[1200px] pb-20 pt-10 xl:pb-[4ch] xl:pl-[2ch] xl:pr-[2ch] xl:pt-[40px]">
          {compareMode === 'versions' && <Versions />}
          {compareMode === 'proposals' && <Proposals />}
        </div>
      </div>
    </>
  );
};

const Versions = () => {
  const { selectedVersion, previousVersion, setIsCompareOpen } = useDiff();
  const [data, isLoading] = useChangesFromVersions(selectedVersion, previousVersion);

  if (isLoading) {
    return <div className="text-metadataMedium">Loading...</div>;
  }

  if (data === undefined) {
    console.log('data is undefined');
    return <div className="text-metadataMedium">No versions found.</div>;
  }

  const { changes, versions } = data;

  if (!versions.selected) {
    console.log('No selected version');
    return <div className="text-metadataMedium">No versions found.</div>;
  }

  const changedEntityIds = Object.keys(changes);

  // @TODO: Fix change count
  const selectedVersionChangeCount = 0;

  const selectedVersionLastEditedDate = versions.selected.createdAt * 1000;

  const selectedVersionFormattedLastEditedDate = new Date(selectedVersionLastEditedDate).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const selectedVersionLastEditedTime = new Date(selectedVersionFormattedLastEditedDate).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  let previousVersionChangeCount;
  let previousVersionFormattedLastEditedDate;
  let previousVersionLastEditedTime;

  if (versions.previous) {
    // @TODO: Fix change count
    previousVersionChangeCount = 0;

    previousVersionFormattedLastEditedDate = new Date(versions.previous.createdAt * 1000).toLocaleDateString(
      undefined,
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }
    );

    previousVersionLastEditedTime = new Date(previousVersionFormattedLastEditedDate).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  return (
    <div className="relative flex flex-col gap-16">
      <div>
        <div className="flex gap-8">
          <div className="flex-1">
            <div className="text-body">Previous version</div>
            {versions.previous && (
              <>
                <div className="text-mediumTitle">{versions.previous.name}</div>
                <div className="mt-1 flex items-center gap-4">
                  <Link
                    href={versions.previous.createdBy.profileLink ? versions.previous.createdBy.profileLink : ''}
                    className="inline-flex items-center gap-1"
                    onClick={() => setIsCompareOpen(false)}
                  >
                    <div className="relative h-3 w-3 overflow-hidden rounded-full">
                      <Avatar
                        alt={`Avatar for ${versions.previous.createdBy.name ?? versions.previous.createdBy.id}`}
                        avatarUrl={versions.previous.createdBy.avatarUrl}
                        value={versions.previous.createdBy.name ?? versions.previous.createdBy.id}
                      />
                    </div>
                    <p className="text-smallButton">
                      {versions.previous.createdBy.name ?? formatShortAddress(versions.previous.createdBy.id)}
                    </p>
                  </Link>
                  <div>
                    <p className="text-smallButton">
                      {previousVersionChangeCount} {pluralize('edit', previousVersionChangeCount)} ·{' '}
                      {previousVersionFormattedLastEditedDate} · {previousVersionLastEditedTime}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex-1">
            <div className="text-body">Selected version</div>
            <div className="text-mediumTitle">{versions.selected.name}</div>
            <div className="mt-1 flex items-center gap-4">
              <Link
                href={versions.selected.createdBy.profileLink ? versions.selected.createdBy.profileLink : ''}
                className="inline-flex items-center gap-1"
                onClick={() => setIsCompareOpen(false)}
              >
                <div className="relative h-3 w-3 overflow-hidden rounded-full">
                  <Avatar
                    alt={`Avatar for ${versions.selected.createdBy.name ?? versions.selected.createdBy.id}`}
                    avatarUrl={versions.selected.createdBy.avatarUrl}
                    value={versions.selected.createdBy.name ?? versions.selected.createdBy.id}
                  />
                </div>
                <p className="text-smallButton">
                  {versions.selected.createdBy.name ?? formatShortAddress(versions.selected.createdBy.id)}
                </p>
              </Link>
              <div>
                <p className="text-smallButton">
                  {selectedVersionChangeCount} {pluralize('edit', selectedVersionChangeCount)} ·{' '}
                  {selectedVersionFormattedLastEditedDate} · {selectedVersionLastEditedTime}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-16 divide-y divide-grey-02">
        {changedEntityIds.map((entityId: EntityId) => (
          <ChangedEntity key={entityId} change={changes[entityId]} entityId={entityId} />
        ))}
      </div>
    </div>
  );
};

const Proposals = () => {
  const { selectedProposal, previousProposal, setIsCompareOpen } = useDiff();
  const [data, isLoading] = useChangesFromProposals(selectedProposal, previousProposal);

  if (isLoading) {
    return <div className="text-metadataMedium">Loading...</div>;
  }

  if (data === undefined) {
    return <div className="text-metadataMedium">No proposals found.</div>;
  }

  const { changes, proposals } = data;

  if (!proposals.selected) {
    return <div className="text-metadataMedium">No proposals found.</div>;
  }

  const changedEntityIds = Object.keys(changes);

  let selectedVersionChangeCount = 0;

  if (proposals.selected) {
    const proposal: ProposalType = proposals.selected;

    selectedVersionChangeCount = Action.getChangeCount(
      proposal.proposedVersions.reduce<ActionType[]>((acc, version) => acc.concat(version.actions), [])
    );
  }

  const selectedVersionFormattedLastEditedDate = new Date(proposals.selected.createdAt * 1000).toLocaleDateString(
    undefined,
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
  );

  const selectedVersionLastEditedTime = new Date(selectedVersionFormattedLastEditedDate).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  let previousVersionChangeCount;
  let previousVersionFormattedLastEditedDate;
  let previousVersionLastEditedTime;

  if (proposals.previous) {
    const proposal: ProposalType = proposals.previous;

    previousVersionChangeCount = Action.getChangeCount(
      proposal.proposedVersions.reduce<ActionType[]>((acc, version) => acc.concat(version.actions), [])
    );

    previousVersionFormattedLastEditedDate = new Date(proposal.createdAt * 1000).toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    previousVersionLastEditedTime = new Date(previousVersionFormattedLastEditedDate).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  return (
    <div className="relative flex flex-col gap-16">
      <div>
        <div className="flex gap-8">
          <div className="flex-1">
            <div className="text-body">Previous proposal</div>
            {proposals.previous && (
              <>
                <div className="text-mediumTitle">{proposals.previous.name}</div>
                <div className="mt-1 flex items-center gap-4">
                  <Link
                    href={proposals.previous.createdBy.profileLink ? proposals.previous.createdBy.profileLink : ''}
                    className="inline-flex items-center gap-1"
                    onClick={() => setIsCompareOpen(false)}
                  >
                    <div className="relative h-3 w-3 overflow-hidden rounded-full">
                      <Avatar
                        alt={`Avatar for ${proposals.previous.createdBy.name ?? proposals.previous.createdBy.id}`}
                        avatarUrl={proposals.previous.createdBy.avatarUrl}
                        value={proposals.previous.createdBy.name ?? proposals.previous.createdBy.id}
                      />
                    </div>
                    <p className="text-smallButton">
                      {proposals.previous.createdBy.name ?? formatShortAddress(proposals.previous.createdBy.id)}
                    </p>
                  </Link>
                  <div>
                    <p className="text-smallButton">
                      {previousVersionChangeCount} {pluralize('edit', previousVersionChangeCount)} ·{' '}
                      {previousVersionFormattedLastEditedDate} · {previousVersionLastEditedTime}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex-1">
            <div className="text-body">Selected proposal</div>
            <div className="text-mediumTitle">{proposals.selected.name}</div>
            <div className="mt-1 flex items-center gap-4">
              <Link
                href={proposals.selected.createdBy.profileLink ? proposals.selected.createdBy.profileLink : ''}
                className="inline-flex items-center gap-1"
                onClick={() => setIsCompareOpen(false)}
              >
                <div className="relative h-3 w-3 overflow-hidden rounded-full">
                  <Avatar
                    alt={`Avatar for ${proposals.selected.createdBy.name ?? proposals.selected.createdBy.id}`}
                    avatarUrl={proposals.selected.createdBy.avatarUrl}
                    value={proposals.selected.createdBy.name ?? proposals.selected.createdBy.id}
                  />
                </div>
                <p className="text-smallButton">
                  {proposals.selected.createdBy.name ?? formatShortAddress(proposals.selected.createdBy.id)}
                </p>
              </Link>
              <div>
                <p className="text-smallButton">
                  {selectedVersionChangeCount} {pluralize('edit', selectedVersionChangeCount)} ·{' '}
                  {selectedVersionFormattedLastEditedDate} · {selectedVersionLastEditedTime}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-16 divide-y divide-grey-02">
        {changedEntityIds.map((entityId: EntityId) => (
          <ChangedEntity key={entityId} change={changes[entityId]} entityId={entityId} />
        ))}
      </div>
    </div>
  );
};

type ChangedEntityProps = {
  spaceId?: SpaceId;
  change: Changeset;
  entityId: EntityId;
};

const ChangedEntity = ({ change, entityId }: ChangedEntityProps) => {
  const { name, blocks = {}, attributes = {} } = change;

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
        <h3 className="text-mediumTitle">{renderedName}</h3>
        <div className="flex gap-8">
          <div className="flex-1 text-body">Previous version</div>
          <div className="relative flex-1 text-body">This version</div>
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
              attributeId={attributeId}
              attribute={attributes[attributeId]}
              entityId={entityId}
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
  if (!before && !after) return <></>;

  // Don't show unchanged blocks
  if (JSON.stringify(before) === JSON.stringify(after)) return <></>;

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
                <span className="inline-block rounded-lg bg-errorTertiary p-1">
                  <img src={getImagePath(before)} className="rounded-lg" />
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 py-4">
            <div>
              {after && (
                <span className="inline-block rounded-lg bg-successTertiary p-1">
                  <img src={getImagePath(after)} className="rounded-lg" />
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
                  className="mt-2 !overflow-hidden rounded-lg border border-grey-02 p-0 opacity-50 shadow-button"
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
                  className="mt-2 !overflow-hidden rounded-lg border border-grey-02 p-0 opacity-50 shadow-button"
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
  attributeId: AttributeId;
  attribute: AttributeChange;
  entityId: EntityId;
};

const ChangedAttribute = ({ attributeId, attribute }: ChangedAttributeProps) => {
  // Don't show page blocks
  if (attributeId === SYSTEM_IDS.BLOCKS) return <></>;

  const { name, before, after } = attribute;

  // Don't show dead changes
  if (!before && !after) return <></>;

  // Don't show unchanged attributes
  if (JSON.stringify(before) === JSON.stringify(after)) return <></>;

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
      if (!Array.isArray(before) || !Array.isArray(after)) return <></>;

      const diffs = diffArrays(before, after);

      return (
        <div key={attributeId} className="-mt-px flex gap-8">
          <div className="flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="flex flex-wrap gap-2">
              {diffs
                .filter(items => !items.added)
                .map(items => {
                  return (
                    <>
                      {items.value.map(item => (
                        <Chip key={item} status={items.removed ? 'removed' : 'unchanged'}>
                          {item}
                        </Chip>
                      ))}
                    </>
                  );
                })}
            </div>
          </div>
          <div className="group relative flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="flex flex-wrap gap-2">
              {diffs
                .filter(items => !items.removed)
                .map(items => {
                  return (
                    <>
                      {items.value.map(item => (
                        <Chip key={item} status={items.added ? 'added' : 'unchanged'}>
                          {item}
                        </Chip>
                      ))}
                    </>
                  );
                })}
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
              {/* @TODO: When can this be object? */}
              {typeof before !== 'object' && (
                <span className="inline-block rounded-lg bg-errorTertiary p-1">
                  <img src={getImagePath(before)} className="rounded-lg" />
                </span>
              )}
            </div>
          </div>
          <div className="group relative flex-1 border border-grey-02 p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div>
              {/* @TODO: When can this be object? */}
              {typeof after !== 'object' && (
                <span className="inline-block rounded-lg bg-successTertiary p-1">
                  <img src={getImagePath(after)} className="rounded-lg" />
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
          <div className="flex-1 border border-grey-02 p-4">
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

const useChangesFromVersions = (selectedVersion: string, previousVersion: string) => {
  const { subgraph } = Services.useServices();
  const { data, isLoading, error } = useQuery({
    queryKey: [`${selectedVersion}-changes-from-${previousVersion}`],
    queryFn: () => Change.fromVersion(selectedVersion, previousVersion, subgraph),
  });

  // Typescript thinks is an array
  return [data, isLoading] as const;
};

const useChangesFromProposals = (selectedProposal: string, previousProposal: string) => {
  const { subgraph } = Services.useServices();
  const { data, isLoading } = useQuery({
    queryKey: [`${selectedProposal}-changes-from-${previousProposal}`],
    queryFn: () => Change.fromProposal(selectedProposal, previousProposal, subgraph),
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
    queryFn: () => getFilters(rawFilter, subgraph, config),
  });

  return [data, isLoading] as const;
};

const getFilters = async (rawFilter: string, subgraph: Subgraph.ISubgraph, config: Environment.AppConfig) => {
  const filters = await createFiltersFromGraphQLString(rawFilter, async id => await subgraph.fetchEntity({ id }));
  const serverColumns = await fetchColumns({
    params: { skip: 0, first: 0, filter: '' },
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
