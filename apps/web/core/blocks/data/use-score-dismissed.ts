import * as React from 'react';

import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useValues } from '~/core/sync/use-store';

import { SCORE_DISMISSED_PROPERTY_ID } from './block-ontology-ids';
import { parseScoreDismissed, readScoreDismissedFromValues } from './score-dismissed';
import { useDataBlockInstance } from './use-data-block';

export function useScoreDismissed(): boolean {
  const { entityId, spaceId, relationId } = useDataBlockInstance();
  const { blockRelations, initialBlockEntities } = useEditorStoreLite();

  const blocksRelationEntityId = relationId || blockRelations.find(r => r.toEntity.id === entityId)?.entityId || '';

  const initialBlockRelationEntity = React.useMemo(() => {
    if (!blocksRelationEntityId) return null;
    return initialBlockEntities.find(entity => entity.id === blocksRelationEntityId) ?? null;
  }, [blocksRelationEntityId, initialBlockEntities]);

  const dismissedValues = useValues({
    selector: value =>
      value.entity.id === blocksRelationEntityId &&
      value.property.id === SCORE_DISMISSED_PROPERTY_ID &&
      value.spaceId === spaceId,
  });

  return React.useMemo(() => {
    if (dismissedValues.length > 0) {
      const chosen = dismissedValues.find(value => value.isLocal) ?? dismissedValues[0];
      return parseScoreDismissed(chosen.value);
    }

    return readScoreDismissedFromValues(initialBlockRelationEntity?.values, spaceId);
  }, [initialBlockRelationEntity?.values, dismissedValues, spaceId]);
}
