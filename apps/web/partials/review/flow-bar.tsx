'use client';

import { A, D, pipe } from '@mobily/ts-belt';
import { AnimatePresence, motion } from 'framer-motion';
import pluralize from 'pluralize';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useToast } from '~/core/hooks/use-toast';
import { useDiff } from '~/core/state/diff-store/diff-store';
import { useEditable } from '~/core/state/editable-store/editable-store';
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
      <div className="z-[1000]">
        {!hideFlowbar && (
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
        )}
        {/* @TODO: Manage flowbar and review states globally.
          1. Idle (don't show status bar)
          2. Reviewing (don't show status bar)
          3. Publishing (show status bar)
          4. Error (show status bar)

          - In any of the states where we show the status bar we need to hide the flowbar.

          - Additionally we don't show the flowbar when reviewing.
      */}
        {statusBarState.reviewState !== 'idle' && statusBarState.reviewState !== 'reviewing' && <StatusBar />}
      </div>
    </AnimatePresence>
  );
};

interface StatusBarState {
  reviewState: ReviewState;
  error: string | null;
}

type StatusBarActions =
  | {
      type: 'SET_REVIEW_STATE';
      payload: ReviewState;
    }
  | { type: 'ERROR'; payload: string | null };

const statusBarReducer = (state: StatusBarState, action: StatusBarActions): StatusBarState => {
  switch (action.type) {
    case 'SET_REVIEW_STATE':
      return { reviewState: action.payload, error: null };
    case 'ERROR':
      return { reviewState: 'publish-error', error: action.payload };
  }
};

const StatusBarContext = React.createContext<{
  state: StatusBarState;
  dispatch: React.Dispatch<StatusBarActions>;
} | null>(null);

export const StatusBarContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = React.useReducer(statusBarReducer, {
    reviewState: 'idle',
    error: null,
  });

  return <StatusBarContext.Provider value={{ state, dispatch }}>{children}</StatusBarContext.Provider>;
};

export function useStatusBar() {
  const context = React.useContext(StatusBarContext);

  if (!context) {
    throw new Error('useStatusBar must be used within a StatusBarContextProvider');
  }

  return context;
}

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

  let content = (
    <>
      {state.reviewState === 'publish-complete' && (
        <motion.span initial={{ scale: 0.95 }} animate={{ scale: 1 }} transition={{ type: 'spring', duration: 0.15 }}>
          🎉
        </motion.span>
      )}
      {/* Only show spinner if not the complete state */}
      {state.reviewState !== 'publish-complete' && publishingStates.includes(state.reviewState) && <Spinner />}
      <span>{message[state.reviewState]}</span>
    </>
  );

  if (state.reviewState === 'publish-error' && state.error) {
    content = (
      <>
        <Warning color="orange" />
        <span>{message[state.reviewState]}</span>
        <button
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
        </button>
        <button onClick={() => dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' })}>
          <Close />
        </button>
      </>
    );
  }

  return (
    <AnimatePresence>
      <div className="z-[1000] fixed bottom-0 right-0 left-0 flex w-full justify-center">
        <motion.div
          variants={statusVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={transition}
          className="m-8 inline-flex items-center gap-2 rounded bg-text px-3 py-2.5 text-metadataMedium text-white"
        >
          {content}
        </motion.div>
      </div>
    </AnimatePresence>
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

const statusVariants = {
  hidden: { opacity: 0, y: '4px' },
  visible: { opacity: 1, y: '0px' },
};

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
