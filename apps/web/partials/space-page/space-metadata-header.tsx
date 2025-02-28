'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import cx from 'classnames';

import { useState } from 'react';
import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { EntityId } from '~/core/io/schema';
import { fetchCompletedProposals } from '~/core/io/subgraph/fetch-completed-proposals';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Create } from '~/design-system/icons/create';
import { MoveSpace } from '~/design-system/icons/move-space';
import { Menu, MenuItem } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { CreateNewVersionInSpace } from '~/partials/versions/create-new-version-in-space';

import { HistoryEmpty } from '../history/history-empty';
import { HistoryItem } from '../history/history-item';
import { HistoryPanel } from '../history/history-panel';

interface SpacePageMetadataHeaderProps {
  spaceId: string;
  spaceName: string;
  membersComponent: React.ReactElement<any>;
  addSubspaceComponent: React.ReactElement<any>;
  typeNames: string[];
  entityId: string;
}

export function SpacePageMetadataHeader({
  spaceId,
  spaceName,
  membersComponent,
  typeNames,
  entityId,
  addSubspaceComponent,
}: SpacePageMetadataHeaderProps) {
  const isEditing = useUserIsEditing(spaceId);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

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

  const onCopySpaceId = async () => {
    try {
      await navigator.clipboard.writeText(spaceId);
      setIsContextMenuOpen(false);
    } catch (err) {
      console.error('Failed to copy space ID in: ', spaceId);
    }
  };

  const onCopyEntityId = async () => {
    try {
      await navigator.clipboard.writeText(entityId);
      setIsContextMenuOpen(false);
    } catch (err) {
      console.error('Failed to copy entity ID in: ', entityId);
    }
  };

  const [isCreatingNewVersion, setIsCreatingNewVersion] = useState<boolean>(false);

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
          className={cx(!isCreatingNewVersion ? 'max-w-[160]' : 'max-w-[320px]')}
        >
          {isCreatingNewVersion && (
            <CreateNewVersionInSpace
              entityId={entityId as EntityId}
              entityName={spaceName}
              setIsCreatingNewVersion={setIsCreatingNewVersion}
              onDone={() => {
                setIsContextMenuOpen(false);
              }}
            />
          )}
          {!isCreatingNewVersion && (
            <>
              <MenuItem onClick={onCopySpaceId}>
                <Copy color="grey-04" />
                <p>Copy Space ID</p>
              </MenuItem>
              <MenuItem onClick={onCopyEntityId}>
                <Copy color="grey-04" />
                <p>Copy Entity ID</p>
              </MenuItem>
              <MenuItem onClick={() => setIsCreatingNewVersion(true)}>
                <div className="shrink-0">
                  <MoveSpace />
                </div>
                <p>Create in space</p>
              </MenuItem>
              {isEditing && addSubspaceComponent}
            </>
          )}
        </Menu>
      </div>
    </div>
  );
}
