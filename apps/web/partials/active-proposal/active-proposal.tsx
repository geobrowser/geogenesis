import BoringAvatar from 'boring-avatars';
import Link from 'next/link';
import cx from 'classnames';
import { redirect } from 'next/navigation';
import type { Change as Difference } from 'diff';

import * as React from 'react';

import { fetchEntity, fetchProposal, fetchTriples } from '~/core/io/subgraph';

import { Avatar } from '~/design-system/avatar';
import { Button, SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Tick } from '~/design-system/icons/tick';

import { ActiveProposalSlideUp } from './active-proposal-slide-up';
import { Proposal, EntityId, SpaceId, AttributeId, Vote } from '~/core/types';
import { GeoDate, getImagePath, getNoVotePercentage, getProposalTimeRemaining, getYesVotePercentage, isProposalEnded, toTitleCase } from '~/core/utils/utils';
import { AttributeChange, BlockChange, BlockId, Changeset } from '~/core/utils/change/change';
import { diffArrays, diffWords } from 'diff';
import { DateTimeDiff } from '../review/review';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { TableBlockPlaceholder } from '../blocks/table/table-block';
import { colors } from '~/design-system/theme/colors';
import { cva } from 'class-variance-authority';
import { Subgraph } from '~/core/io';
import { ShowVoters } from './active-proposal-show-voters';
import { getAddress } from 'viem';
import { createFiltersFromGraphQLString } from '~/core/blocks-sdk/table';
import { fetchColumns } from '~/core/io/fetch-columns';
import { Entity } from '~/core/utils/entity';
import { TableBlockFilter } from '~/core/state/table-block-store';
import { MetadataMotionContainer } from './active-proposal-metadata-motion-container';
import { getActiveProposalDiff } from './get-active-proposal-diff';
import { getEndedProposalDiff } from './get-ended-proposal-diff';
import { AcceptOrReject } from './accept-or-reject';
import { TEST_MAIN_VOTING_PLUGIN_ADDRESS } from '~/app/dao/constants';

interface Props {
  proposalId?: string;
  connectedAddress: string | undefined;
  spaceId: string;
  reviewComponent?: React.ReactNode;
}

export const ActiveProposal = ({ proposalId, spaceId, connectedAddress }: Props) => {
  return (
    <ActiveProposalSlideUp proposalId={proposalId} spaceId={spaceId}>
      <React.Suspense fallback="Loading...">
        <ReviewActiveProposal connectedAddress={connectedAddress} proposalId={proposalId} spaceId={spaceId} />
      </React.Suspense>
    </ActiveProposalSlideUp>
  );
};

async function ReviewActiveProposal({ proposalId, spaceId, connectedAddress }: Props) {
  if (!proposalId) {
    return null;
  }

  const proposal = await fetchProposal({ id: proposalId });

  if (!proposal) {
    redirect(`/space/${ spaceId }/governance`);
  }

  const votes = proposal.proposalVotes.nodes;
  const votesCount = proposal.proposalVotes.totalCount;

  const yesVotesPercentage = getYesVotePercentage(votes, votesCount);
  const noVotesPercentage = getNoVotePercentage(votes, votesCount);

  const isProposalDone = isProposalEnded(proposal);
  const userVote = connectedAddress ? votes.find(v => v.accountId === getAddress(connectedAddress)) : undefined;

  const { hours, minutes } = getProposalTimeRemaining(proposal.endTime);


  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white px-4 py-1 text-button text-text shadow-big md:px-4 md:py-3">
        <div className="inline-flex items-center gap-4">
          <Link href={`/space/${ spaceId }/governance`}>
            <SquareButton icon={<Close />} />
          </Link>
          <p>Review proposal</p>
        </div>

        {/* @TODO: Use actual voting address from substream */}
        <AcceptOrReject onchainProposalId={proposal.onchainProposalId} votingContractAddress={TEST_MAIN_VOTING_PLUGIN_ADDRESS} isProposalDone={isProposalDone} userVote={userVote} />
      </div>
      <MetadataMotionContainer>
        <div className="mx-auto max-w-[1200px] py-10 xl:pl-[2ch] xl:pr-[2ch]">
          <div className="flex flex-col items-center gap-8">
            <div className="flex flex-col items-center gap-3">
              <div className="text-mediumTitle">{proposal.name}</div>
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-metadataMedium">
                  <Link
                    href={proposal.createdBy.profileLink ?? ''}
                    className="flex items-center gap-2 transition-colors duration-75 hover:text-text"
                  >
                    <div className="relative h-3 w-3 overflow-hidden rounded-full">
                      <Avatar avatarUrl={proposal.createdBy.avatarUrl} value={proposal.createdBy.address} />
                    </div>
                    <p className="text-grey-04">{proposal.createdBy.name ?? proposal.createdBy.address}</p>
                  </Link>
                  <span className="text-grey-04">·</span>
                  <span className="text-text">{isProposalDone ? toTitleCase(proposal.status) : `${hours}h ${minutes}m remaining`}</span>
                </div>
              </div>
            </div>
            <div className="flex w-full gap-[60px]">
              <div className="flex w-1/2 items-center gap-2 text-metadataMedium">
                <div className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
                  <Tick />
                </div>
                <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
                  <div className="absolute bottom-0 left-0 top-0 bg-green" style={{ width: `${ yesVotesPercentage }%` }} />
                </div>
                <div>{yesVotesPercentage}%</div>
              </div>
              <div className="flex w-1/2 items-center gap-2 text-metadataMedium">
                <div className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
                  <Close />
                </div>
                <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
                  <div className="absolute bottom-0 left-0 top-0 bg-red-01" style={{ width: `${ noVotesPercentage }%` }} />
                </div>
                <div>{noVotesPercentage}%</div>
              </div>

            </div>

            <ShowVoters votes={proposal.proposalVotes.nodes} votesCount={votesCount} />
          </div>
        </div>
      </MetadataMotionContainer>
      <div className="rounded-t-4 mt-3 h-full overflow-y-auto overscroll-contain bg-bg shadow-big">
        <div className="mx-auto max-w-[1200px] pb-20 pt-10 xl:pb-[4ch] xl:pl-[2ch] xl:pr-[2ch] xl:pt-[40px]">
          <Proposal proposal={proposal} />
        </div>
      </div>
    </>
  );
}

async function Proposal({ proposal }: { proposal: Proposal }) {
  // @TODO: Get last proposal
  // Depending on whether the proposal is active or ended we need to compare against 
  // either the live versions of entities in the proposal or against the state of 
  // entities in the proposal as they existed at the time the proposal ended.
  const { changes, proposals } = isProposalEnded(proposal) ? await getEndedProposalDiff(proposal, '', Subgraph) : await getActiveProposalDiff(proposal, '8c183a00-ed8f-406c-9b18-2b7ddfc9434e', Subgraph)

  if (!proposals.selected) {
    return <div className="text-metadataMedium">Selected proposal not found.</div>;
  }

  const changedEntityIds = Object.keys(changes);

  return (
    <div className="flex flex-col gap-16 divide-y divide-grey-02">
      {changedEntityIds.map((entityId: EntityId) => (
        <ChangedEntity key={entityId} change={changes[entityId]} entityId={entityId} />
      ))}
    </div>
  )
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
          <div className="flex-1 border first:rounded-t-lg last:rounded-b-lg border-grey-02 p-4">
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
          <div className="group relative flex-1 border border-grey-02 first:rounded-b-lg last:rounded-t-lg p-4">
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
          <div className="flex-1 border border-grey-02 first:rounded-b-lg last:rounded-t-lg p-4">
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
          <div className="group relative flex-1 border border-grey-02 first:rounded-t-lg last:rounded-b-lg p-4">
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
          <div className="flex-1 border border-grey-02 first:rounded-t-lg last:rounded-b-lg p-4">
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
          <div className="group relative flex-1 border border-grey-02 first:rounded-t-lg last:rounded-b-lg p-4">
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
          <div className="flex-1 border border-grey-02 first:rounded-t-lg last:rounded-b-lg p-4">
            <div className="text-bodySemibold capitalize">{name}</div>
            <div className="text-body">
              {before && <DateTimeDiff mode="before" before={before as string | null} after={after as string | null} />}
            </div>
          </div>
          <div className="flex-1 border border-grey-02 first:rounded-t-lg last:rounded-b-lg p-4">
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
          <div className="flex-1 border border-grey-02 first:rounded-t-lg last:rounded-b-lg p-4">
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
          <div className="group relative flex-1 border border-grey-02 first:rounded-t-lg last:rounded-b-lg p-4">
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
              key={`${ entityId }-${ attributeId }`}
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

const TableFilters = async ({ rawFilter }: TableFiltersProps) => {
  const filters = await getFilters(rawFilter);

  if (filters.length === 0) return null;

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

const getFilters = async (rawFilter: string) => {
  const filters = await createFiltersFromGraphQLString(rawFilter, async id => await fetchEntity({ id }));
  const serverColumns = await fetchColumns({
    params: { skip: 0, first: 0, filter: '' },
    api: {
      fetchEntity: fetchEntity,
      fetchTriples: fetchTriples,
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