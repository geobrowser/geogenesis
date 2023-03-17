import * as React from 'react';
import { useMemo } from 'react';
import pluralize from 'pluralize';

import { Action, useActionsStore } from '~/modules/action';
import { Button } from '~/modules/design-system/button';
import { useReview } from '~/modules/review';
import { groupBy } from '~/modules/utils';

export const FlowBar = () => {
  const { allActions, allSpacesWithActions } = useActionsStore();
  const { setIsReviewOpen } = useReview();

  const actionsCount = useMemo(() => Action.getChangeCount(allActions), [allActions]);

  const entitiesCount = useMemo(
    () =>
      Object.keys(
        groupBy(Action.squashChanges(allActions), action => {
          if (action.type === 'deleteTriple' || action.type === 'createTriple') return action.entityId;
          return action.after.entityId;
        })
      ).length,
    [allActions]
  );

  const spacesCount = allSpacesWithActions.length;

  if (actionsCount === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 flex w-full justify-center p-4">
      <div className="pointer-events-auto inline-flex items-center gap-4 rounded bg-white p-2 pl-3 shadow-card">
        <div className="inline-flex items-center font-medium">
          <span>{pluralize('edit', actionsCount, true)}</span>
          <hr className="mx-2 inline-block h-4 w-px border-none bg-grey-03" />
          <span>
            {pluralize('entity', entitiesCount, true)} in {pluralize('space', spacesCount, true)}
          </span>
        </div>
        <Button onClick={() => setIsReviewOpen(true)} variant="primary">
          Review {pluralize('edit', actionsCount, false)}
        </Button>
      </div>
    </div>
  );
};
