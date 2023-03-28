import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import pluralize from 'pluralize';
import { A, D, pipe } from '@mobily/ts-belt';

import { Action, useActionsStore } from '~/modules/action';
import { Button } from '~/modules/design-system/button';
import { useReview } from '~/modules/review';

export const FlowBar = () => {
  const { allActions, allSpacesWithActions } = useActionsStore();
  const { isReviewOpen, setIsReviewOpen } = useReview();

  const allUnpublishedActions = allActions.filter(a => !a.hasBeenPublished);
  const actionsCount = Action.getChangeCount(allUnpublishedActions);

  const entitiesCount = pipe(
    allUnpublishedActions,
    actions => Action.squashChanges(actions),
    A.groupBy(action => {
      if (action.type === 'deleteTriple' || action.type === 'createTriple') return action.entityId;
      return action.after.entityId;
    }),
    D.keys,
    A.length
  );

  const spacesCount = allSpacesWithActions.length;

  if (actionsCount === 0) return null;

  return (
    <AnimatePresence>
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 flex w-full justify-center p-4">
        <motion.div
          variants={flowVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={transition}
          custom={!isReviewOpen}
          className="pointer-events-auto inline-flex items-center gap-4 rounded bg-white p-2 pl-3 shadow-card"
        >
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
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const flowVariants = {
  hidden: { opacity: 0, y: '4px' },
  visible: (custom: boolean) => ({
    opacity: custom ? 1 : 0,
    y: custom ? '0px' : '4px',
    transition: {
      type: 'spring',
      duration: 0.5,
      bounce: 0,
      delay: custom ? 0.5 : 0,
    },
  }),
};

const transition = { type: 'spring', duration: 0.5, bounce: 0 };
