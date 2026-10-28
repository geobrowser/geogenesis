'use client';

import * as React from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useSetAtom } from 'jotai';
import { createPortal } from 'react-dom';

import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { MOBILE_SHEET_ENTRANCE_SPRING, useMobileSheetDrag } from '~/core/hooks/use-mobile-sheet-drag';
import { EntitySidePanelPopoverPortalProvider } from '~/core/state/entity-side-panel-popover-portal';
import { InsideMobileSheet } from '~/core/state/mobile-sheet-cover';
import { hideMainPageScrollbars } from '~/core/utils/hide-main-scrollbars';

import { MobileSheetSurface } from '~/design-system/mobile-sheet-surface';

import { EntitySidePanelSurface } from '~/partials/entity-page/entity-side-panel';

import { rankingComposeRemoveScrollShardAtom } from '~/atoms';

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
  const reduceMotion = useReducedMotion();
  const setRemoveScrollShard = useSetAtom(rankingComposeRemoveScrollShardAtom);

  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);

  const { setOverlayElement, sheetStyle, sheetControlsRef, sheet } = useMobileSheetDrag({
    enabled: isMobile && Boolean(target),
    onDismiss: onClose,
    peekTopPx: ENTITY_SHEET_TOP_OFFSET_PX,
  });

  const overlayRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setOverlayElement(node);
      setRemoveScrollShard(node);
    },
    [setOverlayElement, setRemoveScrollShard]
  );

  React.useLayoutEffect(() => {
    return () => setRemoveScrollShard(null);
  }, [setRemoveScrollShard]);

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

  if (!portalTarget) {
    return null;
  }

  const panelBody = target ? (
    <EntitySidePanelPopoverPortalProvider>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <EntitySidePanelSurface
          entityId={target.entityId}
          requestedSpaceId={target.spaceId}
          openedWithMainViewEditing={false}
          previewImageUrl={target.previewImageUrl}
          previewName={target.previewName}
          previewDescription={target.previewDescription}
          onClose={onClose}
        />
      </div>
    </EntitySidePanelPopoverPortalProvider>
  ) : null;

  return createPortal(
    <AnimatePresence>
      {target ? (
        <motion.div
          key={`${target.spaceId}:${target.entityId}`}
          ref={overlayRef}
          className="fixed inset-0 z-[210] overscroll-none"
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

          {isMobile ? (
            <MobileSheetSurface
              role="dialog"
              aria-modal="true"
              data-ranking-entity-sheet
              sheetStyle={sheetStyle}
              sheetControlsRef={sheetControlsRef}
              sheet={sheet}
              exit={{ transform: reduceMotion ? 'translateY(0%)' : 'translateY(100%)' }}
              onClick={event => event.stopPropagation()}
            >
              {panelBody}
            </MobileSheetSurface>
          ) : (
            <motion.div
              role="dialog"
              aria-modal="true"
              data-ranking-entity-sheet
              data-mobile-sheet-surface
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={MOBILE_SHEET_ENTRANCE_SPRING}
              className="rounded-l-2xl shadow-2xl absolute inset-y-0 right-0 z-1 flex w-[min(600px,100vw)] flex-col overflow-hidden border-l border-grey-02 bg-white"
              onClick={event => event.stopPropagation()}
            >
              <InsideMobileSheet sheet={sheet}>{panelBody}</InsideMobileSheet>
            </motion.div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>,

    portalTarget
  );
}
