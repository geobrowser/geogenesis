'use client';

import { usePathname } from 'next/navigation';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Create } from '~/design-system/icons/create';
// import { CsvImport } from '~/design-system/icons/csv-import';
import { Menu, MenuItem } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { HistoryPanel } from '../history/history-panel';

interface SpacePageMetadataHeaderProps {
  spaceId: string;
  membersComponent: React.ReactElement;
  addSubspaceComponent: React.ReactElement;
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
  const [open, onOpenChange] = React.useState(false);

  // @TODO pathname might already include `/entities` or `/import`, resulting in a broken behavior in the context menu
  const pathname = usePathname();

  // const { subgraph } = Services.useServices();

  // const {
  //   data: proposals,
  //   isFetching,
  //   isFetchingNextPage,
  //   fetchNextPage,
  // } = useInfiniteQuery({
  //   queryKey: [`space-proposals-for-space-${spaceId}`],
  //   queryFn: ({ pageParam = 0 }) => subgraph.fetchProposals({ spaceId, page: pageParam }),
  //   getNextPageParam: (_lastPage, pages) => pages.length,
  // });

  // const { setCompareMode, setSelectedProposal, setPreviousProposal, setIsCompareOpen } = useDiff();

  // const isOnePage = proposals?.pages && proposals.pages[0].length < 5;

  // const isLastPage =
  //   proposals?.pages &&
  //   proposals.pages.length > 1 &&
  //   proposals.pages[proposals.pages.length - 1]?.[0]?.id === proposals.pages[proposals.pages.length - 2]?.[0]?.id;

  // const renderedProposals = !isLastPage ? proposals?.pages : proposals?.pages.slice(0, -1);

  // const showMore = !isOnePage && !isLastPage;

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
          History is temporarily disabled
          {/* {proposals?.pages?.length === 1 && proposals?.pages[0].length === 0 && <HistoryEmpty />}
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
                  changeCount={p.proposedVersions.reduce<AppOp[]>((acc, version) => acc.concat(version.ops), []).length}
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
          )} */}
        </HistoryPanel>
        <Menu
          open={open}
          onOpenChange={onOpenChange}
          align="end"
          trigger={open ? <Close color="grey-04" /> : <Context color="grey-04" />}
          className="max-w-[9rem] whitespace-nowrap"
        >
          <MenuItem onClick={onCopyId}>
            <p className="text-button">Copy ID</p>
          </MenuItem>
          <MenuItem href={`${pathname}/entities`} onClick={() => onOpenChange(false)}>
            <p className="text-button">View data</p>
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
