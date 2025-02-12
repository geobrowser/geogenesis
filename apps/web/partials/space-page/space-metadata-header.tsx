'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { fetchCompletedProposals } from '~/core/io/subgraph/fetch-completed-proposals';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Create } from '~/design-system/icons/create';
// import { CsvImport } from '~/design-system/icons/csv-import';
import { Menu, MenuItem } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { HistoryEmpty } from '../history/history-empty';
import { HistoryItem } from '../history/history-item';
import { HistoryPanel } from '../history/history-panel';

interface SpacePageMetadataHeaderProps {
  spaceId: string;
  membersComponent: React.ReactElement<any>;
  addSubspaceComponent: React.ReactElement<any>;
  typeNames: string[];
  entityId: string;
}

export function SpacePageMetadataHeader({
  spaceId,
  membersComponent,
  typeNames,
  entityId,
  addSubspaceComponent,
}: SpacePageMetadataHeaderProps) {
  const isEditing = useUserIsEditing(spaceId);
  const [isContextMenuOpen, setIsContextMenuOpen] = React.useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);

  const {
    data: proposals,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    enabled: isHistoryOpen,
    initialPageParam: 0,
    queryKey: [`space-proposals-for-space-${spaceId}`],
    queryFn: ({ pageParam = 0 }) => fetchCompletedProposals({ spaceId, page: pageParam }),
    getNextPageParam: (_lastPage, pages) => pages.length,
  });

  const isOnePage = proposals?.pages && proposals.pages[0].length < 5;

  const isLastPage =
    proposals?.pages &&
    proposals.pages.length > 1 &&
    proposals.pages[proposals.pages.length - 1]?.[0]?.id === proposals.pages[proposals.pages.length - 2]?.[0]?.id;

  const renderedProposals = !isLastPage ? proposals?.pages : proposals?.pages.slice(0, -1);

  const showMore = !isOnePage && !isLastPage;

  const additionalTypeChips = typeNames
    .filter(t => t !== 'Space')
    .map((typeName, i) => (
      <span key={i} className="flex h-6 items-center rounded-sm bg-divider px-1.5 text-breadcrumb text-grey-04">
        {typeName}
      </span>
    ));

  const onCopyId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsContextMenuOpen(false);
    } catch (err) {
      console.error('Failed to copy entity ID in: ', entityId);
    }
  };

  return (
    <div className="relative z-20 flex flex-wrap items-center justify-between gap-y-2 text-text">
      <div className="flex items-center gap-2">
        <span className="flex h-6 items-center rounded-sm bg-text px-1.5 text-breadcrumb text-white">Space</span>
        {additionalTypeChips}
        {membersComponent}
      </div>
      <div className="inline-flex items-center gap-4">
        {isEditing && (
          <Link
            href={NavUtils.toEntity(spaceId, ID.createEntityId())}
            className="stroke-grey-04 transition-colors duration-75 hover:stroke-text sm:hidden"
          >
            <Create />
          </Link>
        )}
        <HistoryPanel open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          {proposals?.pages?.length === 1 && proposals?.pages[0].length === 0 && <HistoryEmpty />}
          {renderedProposals?.map((group, index) => (
            <React.Fragment key={index}>
              {group.map(p => (
                <HistoryItem
                  key={p.id}
                  spaceId={spaceId}
                  proposalId={p.id}
                  createdAt={p.createdAt}
                  createdBy={p.createdBy}
                  name={p.name}
                />
              ))}
            </React.Fragment>
          ))}
          {showMore && (
            <div className="flex h-12 w-full flex-shrink-0 items-center justify-center bg-white">
              {isFetching || isFetchingNextPage ? (
                <Dots />
              ) : (
                <SmallButton variant="secondary" onClick={() => fetchNextPage()}>
                  Show more
                </SmallButton>
              )}
            </div>
          )}
        </HistoryPanel>
        <Menu
          open={isContextMenuOpen}
          onOpenChange={setIsContextMenuOpen}
          align="end"
          trigger={isContextMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
          className="max-w-[9rem] whitespace-nowrap"
        >
          <MenuItem onClick={onCopyId}>
            <p className="text-button">Copy ID</p>
          </MenuItem>

          {isEditing && addSubspaceComponent}

          {/* <Link
            href={`${pathname}/import`}
            onClick={() => onOpenChange(false)}
            className="flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2 hover:bg-bg"
          >
              <p className="text-button">CSV import</p>
          </Link> */}
        </Menu>
      </div>
    </div>
  );
}
