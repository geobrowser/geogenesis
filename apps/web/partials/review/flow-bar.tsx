'use client';

import { A, D, pipe } from '@mobily/ts-belt';
import { AnimatePresence, motion } from 'framer-motion';
import pluralize from 'pluralize';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useToast } from '~/core/hooks/use-toast';
import { useDiff } from '~/core/state/diff-store';
import { useEditable } from '~/core/state/editable-store';
import { useStatusBar } from '~/core/state/status-bar-store';
import { ReviewState } from '~/core/types';
import { Action } from '~/core/utils/action';

import { Button } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { TickSmall } from '~/design-system/icons/tick-small';
import { Warning } from '~/design-system/icons/warning';
import { Spinner } from '~/design-system/spinner';

export const FlowBar = () => {
  const { state: statusBarState } = useStatusBar();
  const [toast] = useToast();
  const { editable } = useEditable();
  const { isReviewOpen, setIsReviewOpen } = useDiff();
  const { allActions, allSpacesWithActions } = useActionsStore();

  const allUnpublishedSquashedActions = Action.prepareActionsForPublishing(allActions);
  const actionsCount = allUnpublishedSquashedActions.length;

  const entitiesCount = pipe(
    allUnpublishedSquashedActions,
    A.groupBy(action => {
      if (action.type === 'deleteTriple' || action.type === 'createTriple') return action.entityId;
      return action.after.entityId;
    }),
    D.keys,
    A.length
  );

  const spacesCount = allSpacesWithActions.length;

  // Don't show the flow bar if there are no actions, if the user is not in edit mode, if there is a toast,
  // or if the status bar is rendering in place.
  const hideFlowbar = actionsCount === 0 || !editable || toast || statusBarState.reviewState !== 'idle';

  return (
    <AnimatePresence>
      <div className="relative z-[1000]">
        {!hideFlowbar && (
          <div className="pointer-events-none fixed bottom-0 left-0 right-0 flex w-full justify-center p-4">
            <motion.div
              variants={flowVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={transition}
              custom={!isReviewOpen}
              className="pointer-events-auto inline-flex items-center gap-4 rounded-lg bg-white p-2 pl-3 shadow-card"
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
        )}

        {statusBarState.reviewState !== 'idle' && statusBarState.reviewState !== 'reviewing' && <StatusBar />}
      </div>
    </AnimatePresence>
  );
};

const StatusBar = () => {
  const { state, dispatch } = useStatusBar();

  const [isCopied, setIsCopied] = React.useState(false);

  const onCopyError = async () => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(state.error || '');
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[1000] flex origin-center flex-col items-center">
      <motion.div layout transition={{ type: 'spring', bounce: 0.2, duration: 0.2 }}>
        <div className="m-8 h-10 overflow-hidden rounded bg-text px-3 py-2.5 text-button text-white">
          <AnimatePresence mode="wait">
            <div className="flex items-center justify-center gap-2">
              {state.reviewState === 'publish-error' && state.error ? (
                <>
                  <Warning color="red-01" />
                  {/* Negative top margin visually aligns the text. Programatically aligning it feels a bit off visually. */}
                  <motion.span
                    key={message[state.reviewState]}
                    initial={{ opacity: 0, filter: 'blur(2px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(2px)' }}
                    transition={{ type: 'spring', duration: 0.5, delay: 0.15 }}
                    className="-mt-[2px]"
                  >
                    {message[state.reviewState]}
                  </motion.span>
                  <motion.button
                    initial={{ opacity: 0, filter: 'blur(2px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(2px)' }}
                    transition={{ type: 'spring', duration: 0.5, delay: 0.15 }}
                    className="flex w-[70px] items-center justify-center rounded border border-white bg-transparent p-1 text-smallButton"
                    onClick={onCopyError}
                  >
                    <AnimatePresence mode="popLayout">
                      {isCopied ? (
                        <motion.div
                          key="status-bar-error"
                          initial={{ scale: 0.95, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.95, opacity: 0 }}
                        >
                          <TickSmall />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="status-bar-error"
                          initial={{ scale: 0.95, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.95, opacity: 0 }}
                        >
                          Copy error
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                  <button onClick={() => dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' })}>
                    <Close />
                  </button>
                </>
              ) : (
                <>
                  {state.reviewState === 'publish-complete' && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', bounce: 0.5, duration: 0.5, delay: 0.15 }}
                    >
                      🎉
                    </motion.span>
                  )}
                  {/* Only show spinner if not the complete state */}
                  {state.reviewState !== 'publish-complete' && publishingStates.includes(state.reviewState) && (
                    <Spinner />
                  )}
                  <motion.span
                    key={message[state.reviewState]}
                    initial={{ opacity: 0, filter: 'blur(2px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(2px)' }}
                    transition={{ type: 'spring', duration: 0.5, delay: 0.15 }}
                  >
                    {message[state.reviewState]}
                  </motion.span>
                </>
              )}
            </div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

const message: Record<ReviewState, string> = {
  idle: '',
  reviewing: '',
  'publishing-ipfs': 'Uploading changes to IPFS',
  'signing-wallet': 'Sign your transaction',
  'publishing-contract': 'Adding your changes to The Graph',
  'publish-complete': 'Changes published!',
  'publish-error': 'An error has occurred',
};

const publishingStates: Array<ReviewState> = [
  'publishing-ipfs',
  'signing-wallet',
  'publishing-contract',
  'publish-complete',
  'publish-error',
];

const flowVariants = {
  hidden: { opacity: 0, y: '4px' },
  visible: (custom: boolean) => ({
    opacity: custom ? 1 : 0,
    y: custom ? '0px' : '4px',
    transition: {
      type: 'spring',
      duration: 0.15,
      bounce: 0,
      delay: custom ? 0.15 : 0,
    },
  }),
};

const transition = { type: 'spring', duration: 0.15, bounce: 0 };
