'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import cx from 'classnames';
import { usePathname } from 'next/navigation';

import * as React from 'react';

import { ZERO_WIDTH_SPACE } from '~/core/constants';
import { useEditEvents } from '~/core/events/edit-events';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { EntityId } from '~/core/io/schema';
import { fetchCompletedProposals } from '~/core/io/subgraph/fetch-completed-proposals';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { NavUtils } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Copy } from '~/design-system/icons/copy';
import { Create } from '~/design-system/icons/create';
import { MoveSpace } from '~/design-system/icons/move-space';
import { Menu, MenuItem } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

import { CreateNewVersionInSpace } from '~/partials/versions/create-new-version-in-space';

import { HistoryEmpty } from '../history/history-empty';
import { HistoryItem } from '../history/history-item';
import { HistoryPanel } from '../history/history-panel';

export function EditableSpaceHeading({
  spaceId,
  entityId,
  addSubspaceComponent,
}: {
  spaceId: string;
  entityId: string;
  addSubspaceComponent?: React.ReactElement<any>;
}) {
  const { name } = useEntityPageStore();
  const isEditing = useUserIsEditing(spaceId);

  const path = usePathname();
  const isSpacePage = path === `/space/${spaceId}`;

  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = React.useState(false);
  const [isCreatingNewVersion, setIsCreatingNewVersion] = React.useState<boolean>(false);

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
  
  const send = useEditEvents({
    context: {
      entityId,
      spaceId,
      entityName: name ?? '',
    },
  });

  const onNameChange = (value: string) => {
    send({
      type: 'EDIT_ENTITY_NAME',
      payload: {
        name: value,
      },
    });
  };

  return (
    <div className="relative flex items-center justify-between">
      {isEditing ? (
        <div className="flex-grow">
          <PageStringField variant="mainPage" placeholder="Entity name..." value={name ?? ''} onChange={onNameChange} />
          {/*
            This height differs from the readable page height due to how we're using an expandable textarea for editing
            the entity name. We can't perfectly match the height of the normal <Text /> field with the textarea, so we
            have to manually adjust the spacing here to remove the layout shift.
          */}
          <Spacer height={3.5} />
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between">
            <Truncate maxLines={3} shouldTruncate>
              <Text as="h1" variant="mainPage">
                {name ?? ZERO_WIDTH_SPACE}
              </Text>
            </Truncate>
          </div>
          <Spacer height={12} />
        </div>
      )}
      {isSpacePage && (
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
                entityName={name ?? ''}
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
                {addSubspaceComponent}
              </>
            )}
          </Menu>
        </div>
      )}
    </div>
  );
}
