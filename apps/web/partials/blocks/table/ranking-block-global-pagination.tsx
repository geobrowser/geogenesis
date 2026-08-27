'use client';

import { Spacer } from '~/design-system/spacer';
import { PageNumberContainer } from '~/design-system/table/styles';
import { NextButton, PreviousButton } from '~/design-system/table/table-pagination';

type Props = {
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onSetPage: (page: number | 'previous' | 'next') => void;
};

export function RankingBlockGlobalPagination({ hasPreviousPage, hasNextPage, onSetPage }: Props) {
  return (
    <>
      <Spacer height={12} />
      <PageNumberContainer className="gap-5!">
        <PreviousButton isDisabled={!hasPreviousPage} onClick={() => onSetPage('previous')} />
        <NextButton isDisabled={!hasNextPage} onClick={() => onSetPage('next')} />
      </PageNumberContainer>
    </>
  );
}
