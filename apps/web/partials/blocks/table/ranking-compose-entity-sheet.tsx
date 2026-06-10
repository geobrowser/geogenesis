'use client';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, type PanInfo, motion, useDragControls } from 'framer-motion';
import { createPortal } from 'react-dom';

import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { EntitySidePanelPopoverPortalProvider } from '~/core/state/entity-side-panel-popover-portal';
import { hideMainPageScrollbars } from '~/core/utils/hide-main-scrollbars';

import { EntitySidePanelSurface } from '~/partials/entity-page/entity-side-panel';

type Target = {
  entityId: string;

  spaceId: string;

  previewImageUrl?: string | null;

  previewName?: string | null;

  previewDescription?: string | null;
};

type Props = {
  target: Target | null;

  onClose: () => void;
};

const ENTITY_SHEET_TOP_OFFSET_PX = 200;

export function RankingComposeEntitySheet({ target, onClose }: Props) {
  const isMobile = useIsMobileLayout();

  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);

  const dragControls = useDragControls();

  React.useLayoutEffect(() => {
    setPortalTarget(document.body);
  }, []);

  React.useLayoutEffect(() => {
    if (!target) return;

    const html = document.documentElement;

    const body = document.body;

    html.setAttribute('data-ranking-compose-entity-sheet-open', '');

    body.setAttribute('data-ranking-compose-entity-sheet-open', '');

    const restoreScrollbars = hideMainPageScrollbars();

    return () => {
      restoreScrollbars();

      html.removeAttribute('data-ranking-compose-entity-sheet-open');

      body.removeAttribute('data-ranking-compose-entity-sheet-open');
    };
  }, [target]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 72 || info.velocity.y > 420) {
      onClose();
    }
  };

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {target ? (
        <motion.div
          key={`${target.spaceId}:${target.entityId}`}
          className="fixed inset-0 z-[210]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-grey-04/50"
            onClick={onClose}
            aria-label="Close entity preview"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            drag={isMobile ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.12}
            onDragEnd={handleDragEnd}
            initial={isMobile ? { y: '100%' } : { x: '100%' }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: '100%' } : { x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className={cx(
              'shadow-2xl absolute z-1 flex flex-col overflow-hidden bg-white',
              isMobile
                ? 'rounded-t-2xl inset-x-0 bottom-0'
                : 'rounded-l-2xl inset-y-0 right-0 w-[min(600px,100vw)] border-l border-grey-02'
            )}
            style={isMobile ? { top: ENTITY_SHEET_TOP_OFFSET_PX } : undefined}
            onClick={event => event.stopPropagation()}
          >
            {isMobile ? (
              <div
                className="flex shrink-0 cursor-grab justify-center pt-2 pb-1 active:cursor-grabbing"
                aria-hidden
                onPointerDown={event => dragControls.start(event)}
              >
                <div className="h-1 w-10 rounded-full bg-grey-02" />
              </div>
            ) : null}

            <EntitySidePanelPopoverPortalProvider>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <EntitySidePanelSurface
                  entityId={target.entityId}
                  requestedSpaceId={target.spaceId}
                  openedWithMainViewEditing={false}
                  showHeader={false}
                  previewImageUrl={target.previewImageUrl}
                  previewName={target.previewName}
                  previewDescription={target.previewDescription}
                  onClose={onClose}
                />
              </div>
            </EntitySidePanelPopoverPortalProvider>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,

    portalTarget
  );
}
