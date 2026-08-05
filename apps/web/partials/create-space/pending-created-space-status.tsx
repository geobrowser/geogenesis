'use client';

import { AnimatePresence, motion } from 'framer-motion';

import { usePendingCreatedSpace } from '~/core/state/pending-created-space';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { Spinner } from '~/design-system/spinner';

/**
 * Progress pill for the optimistic "+ New space" flow.
 *
 * The dialog snapshots the deploy args and closes immediately, handing a chain
 * that can run ~120s (IPFS publish + factory tx + receipt + index wait) to
 * `PendingCreatedSpaceRunner`. Without visible feedback that read as failure:
 * users re-opened the dialog and created a second space, and because DAO deploy
 * is not idempotent that minted a second DAO on-chain.
 *
 * Mounted globally next to the runner in app/entry.tsx so it survives the modal
 * closing and client navigation. Top-center to match the publish StatusBar pill
 * this sits alongside, but offset below the navbar so the two never overlap when
 * a publish and a space creation are in flight together.
 */
export function PendingCreatedSpaceStatus() {
  const { isPending, spaceName } = usePendingCreatedSpace();

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-12 ${Z_LAYER_CLASS.statusBar} flex flex-col items-center`}
      aria-live="polite"
    >
      <AnimatePresence>
        {isPending && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
            className="pointer-events-auto"
          >
            <div className="flex h-10 items-center gap-2 overflow-hidden rounded bg-text px-3 py-2.5 text-button text-white shadow-lg">
              <Spinner />
              <span className="max-w-[280px] truncate">
                {spaceName ? `Creating ${spaceName}…` : 'Creating your space…'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
