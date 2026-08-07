import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { ID } from '~/core/id';
import { store } from '~/core/sync/use-sync-engine';

import { columnPropertyIdFromRelation, isShownColumnRelationType } from './shown-column-relations';
import { isScorePropertyShown } from './is-score-property-shown';

export function isScoreVisibleOnBrowseView(shownColumnIds: readonly string[], blockRelationId: string | undefined): boolean {
  if (isScorePropertyShown(shownColumnIds)) return true;
  if (!blockRelationId) return true;

  const scoreRelations = store.getResolvedRelations(blockRelationId, true).filter(
    r => isShownColumnRelationType(r.type.id) && ID.equals(columnPropertyIdFromRelation(r), SCORE_SYSTEM_PROPERTY)
  );

  if (scoreRelations.some(r => r.isDeleted)) return false;
  return true;
}
