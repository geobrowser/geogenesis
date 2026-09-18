'use client';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, type AnimationDefinition, motion } from 'framer-motion';
import { useAtomValue, useSetAtom } from 'jotai';
import { createPortal } from 'react-dom';
import { RemoveScroll } from 'react-remove-scroll';

import { Z_LAYER_CLASS } from '~/core/z-layers';

import {
  commentsPanelHostElementAtom,
  entitySidePanelHostElementAtom,
  slideUpOpenCountAtom,
  slideUpPopoverContainerAtom,
} from '~/atoms';

type SlideUpProps = {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void | React.Dispatch<React.SetStateAction<boolean>>;
  children: React.ReactNode;
  deferEscapeClose?: boolean;
  onEnterAnimationComplete?: (definition: AnimationDefinition) => void;
};

export const SlideUp = ({
  isOpen,
  setIsOpen,
  children,
  deferEscapeClose = false,
  onEnterAnimationComplete,
}: SlideUpProps) => {
  const entitySidePanelHost = useAtomValue(entitySidePanelHostElementAtom);
  const commentsPanelHost = useAtomValue(commentsPanelHostElementAtom);

  // A body-level home for popovers opened from inside this sheet — a comment's responder list, for
  // one. They portal to the body, which puts them outside the lock below, so one taller than its own
  // max-height could be read and not scrolled. Sharding this container exempts whatever lands in it,
  // and keeping it on the body leaves the popover's positioning exactly where it already works.
  const [popoverContainer, setPopoverContainer] = React.useState<HTMLElement | null>(null);
  const setSlideUpPopoverContainer = useSetAtom(slideUpPopoverContainerAtom);
  React.useEffect(() => {
    // No `isOpen` check: closing unmounts the portal below, which calls the ref with null, so this
    // already follows the sheet. Releases only its own container on unmount, because more than one
    // sheet can be open and the other one's must outlive this one closing.
    setSlideUpPopoverContainer(popoverContainer);
    return () => setSlideUpPopoverContainer(current => (current === popoverContainer ? null : current));
  }, [popoverContainer, setSlideUpPopoverContainer]);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Every overlay that can be opened from inside a slide-up has to be exempt from its scroll lock,
  // or it draws above the sheet and then refuses to scroll.
  const removeScrollShards = React.useMemo(
    () =>
      [entitySidePanelHost, commentsPanelHost, popoverContainer].filter((node): node is HTMLElement => node !== null),
    [entitySidePanelHost, commentsPanelHost, popoverContainer]
  );

  // Published so those overlays know they have a sheet to clear. Counted, so two open sheets do not
  // let the first one to close report that none are.
  const setSlideUpOpenCount = useSetAtom(slideUpOpenCountAtom);
  React.useEffect(() => {
    if (!isOpen) return;
    setSlideUpOpenCount(count => count + 1);
    return () => setSlideUpOpenCount(count => Math.max(0, count - 1));
  }, [isOpen, setSlideUpOpenCount]);

  // A panel raised above this sheet owns Escape while it is open. Both listen on the window and this
  // sheet's listener is registered first — it was open first — so one press would otherwise close the
  // panel and the sheet under it at once. The same one-layer-per-press rule the comments panel already
  // follows for the entity side panel above it.
  const raisedPanelOpen = entitySidePanelHost !== null || commentsPanelHost !== null;

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // `isComposing` and `defaultPrevented` are guarded the way the panels above do it: mid-IME
      // composition Escape ends the composition, and the sheet now contains a comment composer, so
      // closing on it would take an unsent draft with it.
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return;
      if (deferEscapeClose || raisedPanelOpen) return;
      setIsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen, deferEscapeClose, raisedPanelOpen]);

  return (
    <>
      {/* Outside `AnimatePresence`, which owns the presence of what it wraps — this container is not
          animated and should exist for exactly as long as the sheet is open. */}
      {mounted && isOpen && createPortal(<div ref={setPopoverContainer} data-slide-up-popover-host />, document.body)}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="slide-up-root"
            className={cx('fixed inset-0', Z_LAYER_CLASS.slideUp)}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Opaque layer so underlying route (e.g. space governance) never flashes before the sheet animates */}
            <div className="absolute inset-0 bg-white" aria-hidden />
            <motion.div
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={transition}
              onAnimationComplete={onEnterAnimationComplete}
              className="absolute inset-0 flex h-full w-full flex-col overflow-hidden"
            >
              <RemoveScroll className="h-full w-full" shards={removeScrollShards}>
                <div data-app-scroll-surface className="h-full overflow-y-auto overscroll-contain bg-white">
                  {children}
                </div>
              </RemoveScroll>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const variants = {
  hidden: { y: '100%' },
  visible: {
    y: '0%',
    transition: {
      type: 'spring' as const,
      duration: 0.5,
      bounce: 0,
    },
  },
};

const transition = { type: 'spring' as const, duration: 0.5, bounce: 0 };
