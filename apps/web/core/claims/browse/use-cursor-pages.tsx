'use client';

import * as React from 'react';

import { Spacer } from '~/design-system/spacer';
import { PageNumberContainer } from '~/design-system/table/styles';
import { NextButton, PreviousButton } from '~/design-system/table/table-pagination';

/**
 * Forward-and-back paging over a cursor connection.
 *
 * The connection's cursors only go forward — a page hands back the cursor that follows it, never
 * the one that preceded it — so stepping back means remembering the cursor each page was fetched
 * with. That history is the whole reason this exists.
 *
 * Moving forward from a page mid-history truncates what came after it, so the trail always
 * describes the route actually taken rather than a branch abandoned earlier.
 */
export function useCursorPages() {
  // The first page has no cursor, which is why the trail starts with `undefined` rather than empty.
  const [trail, setTrail] = React.useState<(string | undefined)[]>([undefined]);
  const [index, setIndex] = React.useState(0);

  // Which way the reader last stepped. A section that filters rows out client-side can land on a
  // page holding nothing to show, and skipping past it has to continue the way they were going —
  // advancing after a Previous would walk them back to where they came from.
  const [direction, setDirection] = React.useState<'forward' | 'back'>('forward');

  const toNext = React.useCallback(
    (endCursor: string) => {
      setTrail(current => [...current.slice(0, index + 1), endCursor]);
      setIndex(current => current + 1);
      setDirection('forward');
    },
    [index]
  );

  const toPrevious = React.useCallback(() => {
    setIndex(current => Math.max(0, current - 1));
    setDirection('back');
  }, []);

  /** Back to page one — for when the query's inputs change under the pager. */
  const reset = React.useCallback(() => {
    setTrail([undefined]);
    setIndex(0);
    setDirection('forward');
  }, []);

  return {
    cursor: trail[index],
    isFirstPage: index === 0,
    direction,
    toNext,
    toPrevious,
    reset,
  };
}

/**
 * Previous / next controls for a section that pages in place.
 *
 * The same buttons and container a data block pages with, composed the way
 * `RankingBlockGlobalPagination` composes them — the claim page has no business growing its own
 * pager when the app already has one.
 *
 * No page numbers, unlike the table block's pager: numbered pages let a reader jump, and a cursor
 * connection can only step. Offering a number nobody can click to would be chrome pretending at a
 * capability this doesn't have.
 */
export function CursorPager({
  isFirstPage,
  hasNextPage,
  isLoading,
  onPrevious,
  onNext,
}: {
  isFirstPage: boolean;
  hasNextPage: boolean;
  isLoading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  // One page and nowhere to go: the controls would only ever be disabled, so they stay out.
  if (isFirstPage && !hasNextPage) return null;

  return (
    <>
      <Spacer height={12} />
      <PageNumberContainer className="gap-5!">
        <PreviousButton isDisabled={isFirstPage || isLoading} onClick={onPrevious} />
        <NextButton isDisabled={!hasNextPage || isLoading} onClick={onNext} />
      </PageNumberContainer>
    </>
  );
}
