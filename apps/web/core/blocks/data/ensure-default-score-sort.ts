import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { ID } from '~/core/id';
import type { ColumnSortState } from '~/core/utils/column-sort';

export const DEFAULT_SCORE_SORT_STATE: ColumnSortState = {
  columnId: SCORE_SYSTEM_PROPERTY,
  direction: 'desc',
};

export function shouldApplyDefaultScoreSort(sortState: ColumnSortState, scoreIsRelevant: boolean): boolean {
  return scoreIsRelevant && sortState === null;
}

export function isSortedByScoreDescending(sortState: ColumnSortState): boolean {
  return (
    sortState != null &&
    ID.equals(sortState.columnId, SCORE_SYSTEM_PROPERTY) &&
    sortState.direction === 'desc'
  );
}
