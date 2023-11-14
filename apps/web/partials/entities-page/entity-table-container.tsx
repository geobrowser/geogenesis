'use client';

import { ErrorBoundary } from 'react-error-boundary';

import { memo } from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { EntityOthersToast } from '~/core/presence/entity-others-toast';
import { SpacePresenceProvider } from '~/core/presence/presence-provider';
import { useEditable } from '~/core/state/editable-store';
import { useEntityTable } from '~/core/state/entity-table-store/entity-table-store';
import { Column, Row } from '~/core/types';

import { Spacer } from '~/design-system/spacer';
import { PageContainer, PageNumberContainer } from '~/design-system/table/styles';
import { NextButton, PageNumber, PreviousButton } from '~/design-system/table/table-pagination';
import { Text } from '~/design-system/text';

import { TableBlockPlaceholder } from '../blocks/table/table-block';
import { EntityInput } from './entity-input';
import { EntityTable } from './entity-table';

interface Props {
  spaceId: string;
  spaceName?: string;
  showHeader?: boolean;
}

export const EntityTableContainer = memo(function EntityTableContainer({ spaceId, showHeader = true }: Props) {
  const entityTableStore = useEntityTable();
  const { isEditor } = useAccessControl(spaceId);
  const { editable } = useEditable();

  return (
    <ErrorBoundary
      onError={error =>
        console.error(
          `Error in EntityTableErrorBoundary in space: ${spaceId}, typeId: ${entityTableStore.selectedType?.entityId}`,
          error
        )
      }
      fallback={<Text variant="mediumTitle">Something went wrong. Try refreshing the page.</Text>}
    >
      <PageContainer>
        {showHeader && (
          <>
            <Spacer height={20} />
            <EntityInput spaceId={spaceId} />
            <Spacer height={12} />
          </>
        )}
        {/*
        Using a container to wrap the table to make styling borders around
        the table easier. Otherwise we need to do some pseudoselector shenanigans
        or use box-shadow instead of border.
      */}
        <div className="overflow-hidden rounded border border-grey-02 p-0">
          {entityTableStore.hydrated ? (
            <EntityTable space={spaceId} columns={entityTableStore.columns} rows={entityTableStore.rows} />
          ) : (
            <TableBlockPlaceholder />
          )}
        </div>
        <Spacer height={12} />
        <PageNumberContainer>
          {entityTableStore.pageNumber > 1 && (
            <>
              <PageNumber number={1} onClick={() => entityTableStore.setPage(0)} />
              {entityTableStore.pageNumber > 2 ? (
                <>
                  <Spacer width={16} />
                  <Text color="grey-03" variant="metadataMedium">
                    ...
                  </Text>
                  <Spacer width={16} />
                </>
              ) : (
                <Spacer width={4} />
              )}
            </>
          )}
          {entityTableStore.hasPreviousPage && (
            <>
              <PageNumber number={entityTableStore.pageNumber} onClick={() => entityTableStore.setPage('previous')} />
              <Spacer width={4} />
            </>
          )}
          <PageNumber isActive number={entityTableStore.pageNumber + 1} />
          {entityTableStore.hasNextPage && (
            <>
              <Spacer width={4} />
              <PageNumber number={entityTableStore.pageNumber + 2} onClick={() => entityTableStore.setPage('next')} />
            </>
          )}
          <Spacer width={32} />
          <PreviousButton
            isDisabled={!entityTableStore.hasPreviousPage}
            onClick={() => entityTableStore.setPage('previous')}
          />
          <Spacer width={12} />
          <NextButton isDisabled={!entityTableStore.hasNextPage} onClick={() => entityTableStore.setPage('next')} />
        </PageNumberContainer>
      </PageContainer>
      {isEditor && editable && (
        <SpacePresenceProvider entityId={entityTableStore.selectedType?.entityId ?? ''} spaceId={spaceId}>
          <EntityOthersToast />
        </SpacePresenceProvider>
      )}
    </ErrorBoundary>
  );
});
