'use client';

import { Spacer } from '~/design-system/spacer';
import { PageNumberContainer } from '~/design-system/table/styles';
import { NextButton, PageNumber, PreviousButton } from '~/design-system/table/table-pagination';
import { Text } from '~/design-system/text';

type Props = {
  pageNumber: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onSetPage: (page: number | 'previous' | 'next') => void;
};

export function RankingBlockGlobalPagination({ pageNumber, hasPreviousPage, hasNextPage, onSetPage }: Props) {
  return (
    <>
      <Spacer height={12} />
      <PageNumberContainer>
        {pageNumber > 1 ? (
          <>
            <PageNumber number={1} onClick={() => onSetPage(0)} />
            {pageNumber > 2 ? (
              <Text color="grey-03" variant="metadataMedium">
                ...
              </Text>
            ) : null}
          </>
        ) : null}
        {hasPreviousPage ? <PageNumber number={pageNumber} onClick={() => onSetPage('previous')} /> : null}
        <PageNumber isActive number={pageNumber + 1} />
        {hasNextPage ? <PageNumber number={pageNumber + 2} onClick={() => onSetPage('next')} /> : null}
        <Spacer width={8} />
        <PreviousButton isDisabled={!hasPreviousPage} onClick={() => onSetPage('previous')} />
        <NextButton isDisabled={!hasNextPage} onClick={() => onSetPage('next')} />
      </PageNumberContainer>
    </>
  );
}
