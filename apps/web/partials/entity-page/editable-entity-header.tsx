'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { ZERO_WIDTH_SPACE } from '~/core/constants';
import { useEditEvents } from '~/core/events/edit-events';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { fetchHistoryVersions } from '~/core/io/subgraph/fetch-history-versions';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';

import { SmallButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import { HistoryEmpty } from '../history/history-empty';
import { HistoryItem } from '../history/history-item';
import { HistoryPanel } from '../history/history-panel';
import { EntityPageContextMenu } from './entity-page-context-menu';

export function EditableHeading({
  spaceId,
  entityId,
  entityName,
}: {
  spaceId: string;
  entityId: string;
  entityName: string;
}) {
  const { name } = useEntityPageStore();
  const isEditing = useUserIsEditing(spaceId);

  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);

  const {
    data: versions,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    enabled: isHistoryOpen,
    queryKey: [`entity-versions-for-entityId-${entityId}`],
    queryFn: ({ signal, pageParam = 0 }) => fetchHistoryVersions({ entityId, page: pageParam, signal }),
    getNextPageParam: (_lastPage, pages) => pages.length,
    initialPageParam: 0,
  });

  const isOnePage = versions?.pages && versions.pages[0].length < 5;

  const isLastPage =
    versions?.pages &&
    versions.pages.length > 1 &&
    versions.pages[versions.pages.length - 1]?.[0]?.id === versions.pages[versions.pages.length - 2]?.[0]?.id;

  const renderedVersions = !isLastPage ? versions?.pages : versions?.pages.slice(0, -1);
  const showMore = !isOnePage && !isLastPage;

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
        <div>
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
            <Text as="h1" variant="mainPage">
              {name ?? ZERO_WIDTH_SPACE}
            </Text>
          </div>
          <Spacer height={12} />
        </div>
      )}
      <div className="flex items-center gap-5">
        <HistoryPanel open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          {versions?.pages?.length === 0 && <HistoryEmpty />}
          {renderedVersions?.map((group, index) => (
            <React.Fragment key={index}>
              {group.map(v => (
                <HistoryItem
                  key={v.id}
                  spaceId={spaceId}
                  proposalId={v.proposalId}
                  createdAt={v.createdAt}
                  createdBy={v.createdBy}
                  name={v.editName}
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
        <EntityPageContextMenu entityId={entityId} entityName={entityName} spaceId={spaceId} />
      </div>
    </div>
  );
}
