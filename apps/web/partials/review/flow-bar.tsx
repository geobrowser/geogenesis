'use client';

import * as React from 'react';

import cx from 'classnames';
import { Array as A, pipe } from 'effect';
import { AnimatePresence, motion } from 'framer-motion';
import pluralize from 'pluralize';
import { RemoveScroll } from 'react-remove-scroll';

import { useToast } from '~/core/hooks/use-toast';
import { useDiff } from '~/core/state/diff-store';
import { useEditable } from '~/core/state/editable-store';
import { useStatusBar } from '~/core/state/status-bar-store';
import { syncedEntities } from '~/core/sync/store';
import { useRelations, useValues } from '~/core/sync/use-store';
import { Relation, ReviewState, Value } from '~/core/types';

import { SmallButton } from '~/design-system/button';
import { Divider } from '~/design-system/divider';
import { Close } from '~/design-system/icons/close';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { TickSmall } from '~/design-system/icons/tick-small';
import { Warning } from '~/design-system/icons/warning';
import { Spinner } from '~/design-system/spinner';

export const FlowBar = () => {
  const { state: statusBarState } = useStatusBar();
  const [toast] = useToast();
  const { editable } = useEditable();
  const { isReviewOpen, setIsReviewOpen, bumpReviewVersion } = useDiff();

  const allValues = useValues({
    selector: t => t.hasBeenPublished === false && t.isLocal === true,
    includeDeleted: true,
  });

  const allRelations = useRelations({
    includeDeleted: true,
    selector: r => r.hasBeenPublished === false && r.isLocal === true,
  });

  // Filter to only count net changes (exclude no-ops like created-then-deleted
  // relations and values/relations that match the remote state).
  const values = React.useMemo(() => getNetValues(allValues), [allValues]);
  const relations = React.useMemo(() => getNetRelations(allRelations), [allRelations]);

  const opsCount = values.length + relations.length;

  const entitiesCount = pipe(
    [...values.map(t => t.entity.id), ...relations.map(r => r.fromEntity.id)],
    r => [...new Set(r)],
    A.length
  );

  const spacesCount = pipe([...new Set([...values.map(t => t.spaceId), ...relations.map(r => r.spaceId)])], A.length);

  const hideFlowbar = opsCount === 0 || !editable || toast || statusBarState.reviewState !== 'idle';

  return (
    <AnimatePresence>
      <>
        {!hideFlowbar && (
          <div
            className={cx(
              'pointer-events-none fixed inset-x-0 bottom-5 z-1000 flex justify-center text-button',
              RemoveScroll.classNames.fullWidth
            )}
          >
            <motion.div
              variants={flowVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={transition}
              custom={!isReviewOpen}
              className="pointer-events-auto inline-flex h-10 items-center overflow-hidden rounded-lg border border-divider bg-white shadow-lg"
            >
              <div className="inline-flex h-full items-center justify-center">
                <p className="inline-flex items-center px-3">
                  <span>{pluralize('edit', opsCount, true)}</span>
                </p>
                <Divider type="vertical" className="inline-block h-4 w-px" />
                <p className="inline-flex items-center px-3">
                  <span>{pluralize('entity', entitiesCount, true)}</span>
                </p>
                <Divider type="vertical" className="inline-block h-4 w-px" />
                <p className="inline-flex items-center px-3">
                  <span>{pluralize('space', spacesCount, true)}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  bumpReviewVersion();
                  setIsReviewOpen(true);
                }}
                className="h-full border-l border-divider px-4 text-ctaPrimary hover:bg-ctaTertiary focus:bg-ctaTertiary"
              >
                Review edits
              </button>
            </motion.div>
          </div>
        )}

        {statusBarState.reviewState !== 'idle' && statusBarState.reviewState !== 'reviewing' && <StatusBar />}
      </>
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
    <div
      className={cx('fixed inset-x-0 bottom-0 z-1000 flex flex-col items-center', RemoveScroll.classNames.fullWidth)}
    >
      <motion.div layout transition={{ type: 'spring', bounce: 0.2, duration: 0.2 }}>
        <div className="m-8 h-10 overflow-hidden rounded bg-text px-3 py-2.5 text-button text-white">
          <AnimatePresence mode="wait">
            <div className="flex items-center justify-center gap-2">
              {state.reviewState === 'publish-error' && state.error ? (
                <>
                  <Warning color="red-01" />
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
                  {state?.retry ? (
                    <SmallButton onClick={state.retry} variant="tertiary" icon={<RetrySmall />} className="-my-4">
                      Retry
                    </SmallButton>
                  ) : (
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
                  )}
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

/**
 * Filter values to only include net changes compared to the remote/synced state.
 * Excludes values created-then-deleted locally and values unchanged from remote.
 * Only compares against non-local values in syncedEntities because the SyncEngine
 * can bake local edits into syncedEntities during re-sync.
 */
function getNetValues(localValues: Value[]): Value[] {
  return localValues.filter(v => {
    const remoteEntity = syncedEntities.get(v.entity.id);

    if (v.isDeleted) {
      // If no remote entity exists, this value was created and deleted locally — net-zero
      if (!remoteEntity) return false;
      return remoteEntity.values.some(remote => remote.id === v.id && !remote.isLocal);
    }

    // If the value is unchanged from the remote version, skip it
    if (remoteEntity) {
      const remoteValue = remoteEntity.values.find(
        remote => !remote.isLocal && (remote.id === v.id || (remote.property.id === v.property.id && remote.spaceId === v.spaceId))
      );
      if (remoteValue && remoteValue.value === v.value) return false;
    }

    return true;
  });
}

/**
 * Filter relations to only include net changes compared to the remote/synced state.
 * Excludes relations created-then-deleted locally, relations identical to remote,
 * and delete+create pairs that restore the original state (cycling back).
 * Only compares against non-local relations in syncedEntities because the SyncEngine
 * can bake local edits into syncedEntities during re-sync.
 */
function getNetRelations(localRelations: Relation[]): Relation[] {
  // Build a set of semantic keys for active local relations
  const activeKeys = new Set(
    localRelations
      .filter(r => !r.isDeleted)
      .map(r => `${r.fromEntity.id}:${r.type.id}:${r.toEntity.id}:${r.spaceId}`)
  );

  return localRelations.filter(r => {
    const remoteEntity = syncedEntities.get(r.fromEntity.id);

    if (r.isDeleted) {
      // If no remote entity, or the relation ID doesn't exist in remote,
      // this was created and deleted locally — net-zero
      if (!remoteEntity) return false;
      const remoteRelation = remoteEntity.relations.find(remote => remote.id === r.id && !remote.isLocal);
      if (!remoteRelation) return false;

      // If an active local relation restores the same (fromEntity, type, toEntity, space)
      // as the deleted remote relation, both cancel out — net-zero
      const remoteKey = `${remoteRelation.fromEntity.id}:${remoteRelation.type.id}:${remoteRelation.toEntity.id}:${remoteRelation.spaceId}`;
      if (activeKeys.has(remoteKey)) return false;

      return true;
    }

    // Active relation — skip if semantically identical to a remote relation
    if (remoteEntity) {
      const key = `${r.fromEntity.id}:${r.type.id}:${r.toEntity.id}:${r.spaceId}`;
      const matchesRemote = remoteEntity.relations.some(
        remote => !remote.isLocal && `${remote.fromEntity.id}:${remote.type.id}:${remote.toEntity.id}:${remote.spaceId}` === key
      );
      if (matchesRemote) return false;
    }

    return true;
  });
}

const flowVariants = {
  hidden: { opacity: 0, y: '4px' },
  visible: (custom: boolean) => ({
    opacity: custom ? 1 : 0,
    y: custom ? '0px' : '4px',
    transition: {
      type: 'spring' as const,
      duration: 0.15,
      bounce: 0,
      delay: custom ? 0.15 : 0,
    },
  }),
};

const transition = { type: 'spring' as const, duration: 0.15, bounce: 0 };
