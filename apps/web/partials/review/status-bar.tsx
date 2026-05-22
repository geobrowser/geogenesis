'use client';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { RemoveScroll } from 'react-remove-scroll';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useEditable } from '~/core/state/editable-store';
import { useStatusBar } from '~/core/state/status-bar-store';
import { ReviewState } from '~/core/types';
import { Z_LAYER_CLASS, Z_LAYERS } from '~/core/z-layers';
import { collectClientDiagnostics, formatErrorReport } from '~/core/utils/error-diagnostics';

import { Button } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Copy } from '~/design-system/icons/copy';
import { RetrySmall } from '~/design-system/icons/retry-small';
import { TickSmall } from '~/design-system/icons/tick-small';
import { Warning } from '~/design-system/icons/warning';
import { Spinner } from '~/design-system/spinner';

/**
 * Surfaces publish progress and errors.
 *
 * - Progress / success states (publishing-ipfs, signing-wallet,
 *   publishing-contract, publish-complete) render as a small pill at the top
 *   of the screen, vertically centered with the 44px navbar.
 * - Error state renders as a full-screen modal with a backdrop blur. Users
 *   can Copy / Retry / Dismiss (X), press ESC, or click the backdrop to
 *   dismiss.
 *
 * Mounted independently in app/entry.tsx so it never collides with FlowBar
 * {@link Z_LAYERS.statusBar}
 */
export const StatusBar = () => {
  const { state, dispatch } = useStatusBar();
  const { editable } = useEditable();
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId } = usePersonalSpaceId();

  const [isCopied, setIsCopied] = React.useState(false);

  const onDismiss = React.useCallback(() => {
    dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
  }, [dispatch]);

  const onCopyError = async () => {
    if (!navigator.clipboard) return;
    const diagnostics = collectClientDiagnostics({
      loggedIn: !!smartAccount,
      editMode: editable,
      walletAddress: smartAccount?.account.address,
      personalSpaceId,
    });
    const report = formatErrorReport(state.error || '', diagnostics);
    // Clipboard writes can reject on insecure origins, denied permissions, or
    // when the document isn't focused. Surface the failure without crashing
    // the toast — the user can re-screenshot or read the error directly.
    try {
      await navigator.clipboard.writeText(report);
    } catch (err) {
      console.error('[StatusBar] Clipboard write failed:', err);
      return;
    }
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const isError = state.reviewState === 'publish-error' && !!state.error;

  // ESC dismisses the error modal (matches typical modal affordance).
  React.useEffect(() => {
    if (!isError) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isError, onDismiss]);

  if (state.reviewState === 'idle' || state.reviewState === 'reviewing') {
    return null;
  }

  if (isError) {
    return (
      // No entry animation — error toasts shouldn't celebrate themselves. The card
      // appears instantly so the user can read and act without watching a transition.
      <div
        onClick={onDismiss}
        className={cx(
          `fixed inset-0 ${Z_LAYER_CLASS.statusBar} flex items-center justify-center bg-black/75 p-4 backdrop-blur-xl`,
          RemoveScroll.classNames.fullWidth
        )}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="error-title"
          aria-describedby="error-message"
          // Stop propagation so clicks inside the card don't bubble to the
          // backdrop's onClick (which dismisses the modal).
          onClick={e => e.stopPropagation()}
          className="shadow-2xl w-full max-w-[640px] overflow-hidden rounded-lg"
        >
          {/* Top strip: warning icon + title + copy + dismiss, all on one line. */}
          <div className="flex h-10 items-stretch bg-red-01 text-button text-white">
            <div className="flex flex-1 items-center gap-2 px-3">
              <Warning />
              <h2 id="error-title" className="-mt-[2px] truncate">
                Something went wrong
              </h2>
            </div>
            <button
              type="button"
              title={isCopied ? 'Copied to clipboard' : 'Copy error to clipboard'}
              aria-label={isCopied ? 'Error copied to clipboard' : 'Copy error to clipboard'}
              onClick={onCopyError}
              className="flex items-center gap-1.5 border-l border-white/30 px-3 transition-colors hover:bg-red-01/80 focus:bg-red-01/80 focus:outline-none"
            >
              {isCopied ? <TickSmall /> : <Copy />}
              <span className="-mt-[2px]">{isCopied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={onDismiss}
              className="flex items-center border-l border-white/30 px-3 transition-colors hover:bg-red-01/80 focus:bg-red-01/80 focus:outline-none"
            >
              <Close />
            </button>
          </div>

          {/* White section: full error in monospace, plus optional retry. */}
          <div className="bg-white">
            {/* Display is line-clamped to 10 lines so a stack-trace doesn't blow up the modal — the copy button always writes the full error.
                  Padding lives on the wrapper so line-clamp's `-webkit-box` truncation can't eat the bottom padding. */}
            <div className="px-5 py-4">
              <div
                id="error-message"
                className="line-clamp-10 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-text"
              >
                {state.error}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-divider px-5 py-3">
              <p className="text-[12px] leading-relaxed text-grey-04">
                Copy includes diagnostics (browser, OS, login state, edit mode, URL).
              </p>
              {state.retry && (
                <Button onClick={state.retry} variant="secondary" icon={<RetrySmall />}>
                  Retry
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Non-error progress / success states render as the small top-center pill.
  return (
    <div
      className={cx(
        `pointer-events-none fixed inset-x-0 top-0 ${Z_LAYER_CLASS.statusBar} flex flex-col items-center`,
        RemoveScroll.classNames.fullWidth
      )}
    >
      <motion.div layout transition={{ type: 'spring', bounce: 0.2, duration: 0.2 }} className="pointer-events-auto">
        <div className="mt-0.5 flex h-10 items-center overflow-hidden rounded bg-text text-button text-white shadow-lg">
          <AnimatePresence mode="wait">
            <div className="flex h-full items-center justify-center gap-2 px-3 py-2.5">
              {state.reviewState === 'publish-complete' && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', bounce: 0.5, duration: 0.5, delay: 0.15 }}
                >
                  🎉
                </motion.span>
              )}
              {state.reviewState !== 'publish-complete' && publishingStates.includes(state.reviewState) && <Spinner />}
              <motion.span
                key={message[state.reviewState]}
                initial={{ opacity: 0, filter: 'blur(2px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(2px)' }}
                transition={{ type: 'spring', duration: 0.5, delay: 0.15 }}
              >
                {message[state.reviewState]}
              </motion.span>
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
