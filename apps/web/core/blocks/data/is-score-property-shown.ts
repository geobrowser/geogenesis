import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { ID } from '~/core/id';

export function isScorePropertyShown(shownColumnIds: readonly string[]): boolean {
  return shownColumnIds.some(id => ID.equals(id, SCORE_SYSTEM_PROPERTY));
}
