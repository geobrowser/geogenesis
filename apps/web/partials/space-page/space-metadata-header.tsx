'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { Services } from '~/core/services';
import { useDiff } from '~/core/state/diff-store';
import { Action as IAction } from '~/core/types';
import { Action } from '~/core/utils/action';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Create } from '~/design-system/icons/create';
import { Menu } from '~/design-system/menu';
import { Text } from '~/design-system/text';

import { HistoryEmpty } from '../history/history-empty';
import { HistoryItem } from '../history/history-item';
import { HistoryPanel } from '../history/history-panel';

interface SpacePageMetadataHeaderProps {
  spaceId: string;
  membersComponent: React.ReactElement;
  typeNames: string[];
  entityId: string;
}

export function SpacePageMetadataHeader({
  spaceId,
  membersComponent,
  typeNames,
  entityId,
}: SpacePageMetadataHeaderProps) {
  const isEditing = useUserIsEditing(spaceId);
  const [open, onOpenChange] = React.useState(false);

  const pathname = usePathname();

  const { subgraph } = Services.useServices();

  const {
    data: proposals,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [`space-proposals-for-space-${spaceId}`],
    queryFn: ({ pageParam = 0 }) => subgraph.fetchProposals({ spaceId, page: pageParam }),
    getNextPageParam: (_lastPage, pages) => pages.length,
    initialPageParam: 0,
  });

  const { setCompareMode, setSelectedProposal, setPreviousProposal, setIsCompareOpen } = useDiff();

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
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to copy entity ID in: ', entityId);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 text-text">
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
        <HistoryPanel>
          {proposals?.pages?.length === 1 && proposals?.pages[0].length === 0 && <HistoryEmpty />}
          {renderedProposals?.map((group, index) => (
            <React.Fragment key={index}>
              {group.map((p, index) => (
                <HistoryItem
                  key={p.id}
                  onClick={() => {
                    setCompareMode('proposals');
                    setPreviousProposal(group[index + 1]?.id ?? '');
                    setSelectedProposal(p.id);
                    setIsCompareOpen(true);
                  }}
                  changeCount={Action.getChangeCount(
                    p.proposedVersions.reduce<IAction[]>((acc, version) => acc.concat(version.actions), [])
                  )}
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
          open={open}
          onOpenChange={onOpenChange}
          align="end"
          trigger={open ? <Close color="grey-04" /> : <Context color="grey-04" />}
          className="max-w-[7rem] whitespace-nowrap"
        >
          <button
            className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg"
            onClick={onCopyId}
          >
            <Text variant="button" className="hover:!text-text">
              Copy ID
            </Text>
          </button>

          <Link
            href={`${pathname}/entities`}
            className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg"
          >
            <Text variant="button" className="hover:!text-text">
              View data
            </Text>
          </Link>
        </Menu>
      </div>
    </div>
  );
}
