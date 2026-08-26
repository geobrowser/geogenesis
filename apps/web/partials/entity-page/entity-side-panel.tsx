'use client';

import * as React from 'react';

import cx from 'classnames';
import { type PanInfo, motion, useAnimation, useDragControls } from 'framer-motion';
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';

import { bountiesEnabledForNetwork, isBountyEntity } from '~/core/bounties/config';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { getLocalUnpublishedChangesFingerprint } from '~/core/hooks/use-local-changes';
import { useSidePanelEntityScope } from '~/core/hooks/use-side-panel-entity-scope';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useDiff } from '~/core/state/diff-store';
import { useEditable } from '~/core/state/editable-store';
import { SidePanelEditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { EntitySidePanelActiveTabProvider } from '~/core/state/entity-side-panel-active-tab';
import {
  EntitySidePanelEditContext,
  EntitySidePanelEditModeProvider,
} from '~/core/state/entity-side-panel-edit-context';
import { EntitySidePanelPopoverPortalProvider } from '~/core/state/entity-side-panel-popover-portal';
import {
  createPostFlowComplete,
  shouldClearMainEditOnSidePanelClose,
  shouldSuppressSidePanelPathnameAutoClose,
} from '~/core/state/personal-profile/create-post-flow';
import type { Entity } from '~/core/types';
import { hideMainPageScrollbars } from '~/core/utils/hide-main-scrollbars';
import { NavUtils } from '~/core/utils/utils';

import { BulkEdit } from '~/design-system/icons/bulk-edit';
import { CloseSidePanel } from '~/design-system/icons/close-side-panel';
import { EyeSmall } from '~/design-system/icons/eye-small';
import { Fullscreen } from '~/design-system/icons/full-screen';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { BountyDetailHeader, BountyDetailSections } from '~/partials/bounties';
import { EntityPageBody } from '~/partials/entity-page/entity-page-body';
import { useEntityPageSurfaceData } from '~/partials/entity-page/hooks/use-entity-page-surface-data';
import { NavbarBreadcrumb } from '~/partials/navbar/navbar-breadcrumb';

import {
  createPostFlowAtom,
  editorContentVersionAtom,
  entitySidePanelHostElementAtom,
  entitySidePanelPersistEditorAtom,
} from '~/atoms';

const shake = [7, -8.4, 6.3, -10, 8.4, -4.4, 0];

const variants = {
  shake: {
    x: shake,
    transition: {
      duration: 0.15,
      type: 'keyframes' as const,
    },
  },
};

function AnimatedTogglePill({ editable }: { editable: boolean }) {
  return (
    <motion.div
      aria-hidden
      initial={false}
      animate={{ x: editable ? 30 : 0 }}
      transition={{
        duration: 0.5,
        type: 'spring',
        bounce: 0,
      }}
      className="pointer-events-none absolute top-1 left-1 z-0 h-5 w-7 rounded-[44px] bg-white shadow-dropdown"
    />
  );
}

function EntitySidePanelModeToggle() {
  const panelCtx = React.useContext(EntitySidePanelEditContext);
  const controls = useAnimation();
  const { smartAccount } = useSmartAccount();
  const isLoggedIn = Boolean(smartAccount?.account.address);

  const { canEdit: canEditSpace } = useAccessControl(panelCtx?.spaceId ?? '');

  const onToggle = () => {
    if (!panelCtx || !isLoggedIn) return;

    if (!canEditSpace) {
      if (panelCtx.panelWantsEdit) {
        panelCtx.setPanelWantsEdit(false);
        return;
      }
      controls.start('shake');
      return;
    }

    panelCtx.setPanelWantsEdit(v => !v);
  };

  if (!panelCtx || !isLoggedIn) {
    return null;
  }

  const editable = panelCtx.panelWantsEdit;

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-label={editable ? 'Switch to view mode' : 'Switch to edit mode'}
      animate={controls}
      variants={variants}
      className="relative flex w-[66px] shrink-0 items-center justify-between rounded-[47px] bg-divider p-1"
    >
      <AnimatedTogglePill editable={editable} />
      <div className="relative z-10 flex h-5 w-7 items-center justify-center rounded-[44px]">
        <div className={cx('transition-colors duration-300', !editable ? 'text-text' : 'text-grey-03')}>
          <EyeSmall />
        </div>
      </div>
      <div className="relative z-10 flex h-5 w-7 items-center justify-center rounded-[44px]">
        <div
          className={cx(
            'transition-colors duration-300',
            editable ? 'text-text' : canEditSpace ? 'text-grey-03' : 'text-grey-04'
          )}
        >
          <BulkEdit />
        </div>
      </div>
    </motion.button>
  );
}

function EntitySidePanelHeader({
  entityId,
  entitySpaceId,
  onClose,
}: {
  entityId: string;
  entitySpaceId: string;
  onClose: () => void;
}) {
  const panelCtx = React.useContext(EntitySidePanelEditContext);

  const entityPageHref = NavUtils.toEntity(entitySpaceId, entityId, panelCtx?.panelWantsEdit ?? false);

  return (
    <div className="sticky top-0 z-10 flex h-11 shrink-0 items-center gap-2 border-b border-divider bg-white px-4 py-1 sm:px-5">
      <button
        type="button"
        onClick={onClose}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm hover:bg-grey-01"
        aria-label="Close side panel"
      >
        <CloseSidePanel color="grey-04" />
      </button>

      <NavbarBreadcrumb spaceId={entitySpaceId} entityId={entityId} />

      <div className="min-w-0 flex-1" aria-hidden />

      <EntitySidePanelModeToggle />

      <Link
        href={entityPageHref}
        entityId={entityId}
        spaceId={entitySpaceId}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded border border-grey-02 bg-white px-2 text-metadata font-medium text-text shadow-light transition duration-200 ease-in-out hover:border-text hover:bg-bg hover:text-text"
        aria-label="Open entity full page"
      >
        Open
        <Fullscreen />
      </Link>
    </div>
  );
}

function EntitySidePanelBody({
  entityId,
  entitySpaceId,
  entity,
  isLoadingEntity,
  previewImageUrl,
  previewName,
  previewDescription,
}: {
  entityId: string;
  entitySpaceId: string;
  entity: Entity | null;
  isLoadingEntity: boolean;
  /** Fallback avatar/cover when scoped entity relations are not loaded yet (e.g. ranking row image). */
  previewImageUrl?: string | null;
  previewName?: string | null;
  previewDescription?: string | null;
}) {
  const surface = useEntityPageSurfaceData(entityId, entitySpaceId, entity, isLoadingEntity);

  if (surface.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-24 sm:px-5">
        <Text variant="body" color="grey-04">
          Loading entity…
        </Text>
      </div>
    );
  }

  if (!surface.isReady || !entity) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-24 sm:px-5">
        <Text variant="body" color="grey-04">
          Could not load this entity in this space. Try opening it full page from the link in the header.
        </Text>
      </div>
    );
  }

  return (
    <EntityStoreProvider id={entityId} spaceId={entitySpaceId}>
      <SidePanelEditorProvider
        id={entityId}
        spaceId={entitySpaceId}
        initialBlocks={surface.blocks}
        initialBlockRelations={surface.blockRelations}
        initialTabs={surface.initialTabs}
        initialCollectionItems={surface.initialCollectionItems}
      >
        <EntityPageBody
          variant="sidePanel"
          entityId={entityId}
          spaceId={entitySpaceId}
          initialTabRelations={surface.tabRelations}
          tabEntities={surface.tabEntities}
          avatarUrl={surface.avatarUrl}
          coverUrl={surface.coverUrl}
          isRelationPage={surface.isRelationPage}
          previewImageUrl={previewImageUrl}
          previewName={previewName}
          previewDescription={previewDescription}
          // A bounty reads the same in the panel as on its page: facts card + interest
          // above the body, submissions/payouts/allocation below, no properties sheet.
          {...(bountiesEnabledForNetwork && isBountyEntity(entity.types)
            ? {
                notice: <BountyDetailHeader spaceId={entitySpaceId} bountyId={entityId} />,
                belowBodySlot: <BountyDetailSections spaceId={entitySpaceId} bountyId={entityId} />,
                hideProperties: true,
              }
            : {})}
        />
      </SidePanelEditorProvider>
    </EntityStoreProvider>
  );
}

export function EntitySidePanelSurface({
  entityId,
  requestedSpaceId,
  openedWithMainViewEditing,
  openedFromReviewEdits,
  showHeader = true,
  previewImageUrl,
  previewName,
  previewDescription,
  onClose,
}: {
  entityId: string;
  requestedSpaceId: string;
  openedWithMainViewEditing: boolean;
  openedFromReviewEdits?: boolean;
  /** When false, hides the default side-panel chrome (close, space link, edit toggle, open). */
  showHeader?: boolean;
  previewImageUrl?: string | null;
  previewName?: string | null;
  previewDescription?: string | null;
  onClose: () => void;
}) {
  const preferRequestedSpace = openedWithMainViewEditing || Boolean(openedFromReviewEdits);
  const { entity, effectiveSpaceId, isLoading } = useSidePanelEntityScope(
    entityId,
    requestedSpaceId,
    preferRequestedSpace
  );
  const editorContentVersion = useAtomValue(editorContentVersionAtom);

  return (
    <EntitySidePanelEditModeProvider
      entitySpaceId={effectiveSpaceId}
      openedWithMainViewEditing={openedWithMainViewEditing}
      openedFromReviewEdits={openedFromReviewEdits}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {showHeader ? (
          <EntitySidePanelHeader entityId={entityId} entitySpaceId={effectiveSpaceId} onClose={onClose} />
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-entity-side-panel-scroll>
          <EntitySidePanelActiveTabProvider entityId={entityId}>
            <EntitySidePanelBody
              key={`${effectiveSpaceId}:${entityId}:${editorContentVersion}`}
              entityId={entityId}
              entitySpaceId={effectiveSpaceId}
              entity={entity}
              isLoadingEntity={isLoading}
              previewImageUrl={previewImageUrl}
              previewName={previewName}
              previewDescription={previewDescription}
            />
          </EntitySidePanelActiveTabProvider>
        </div>
      </div>
    </EntitySidePanelEditModeProvider>
  );
}

// On mobile the panel opens as a bottom sheet (like the ranking compose flow) rather than a
// full-height right-hand drawer. It starts this far below the top of the screen.
const MOBILE_SHEET_TOP_OFFSET_PX = 200;
const MOBILE_SHEET_SCROLL_SELECTOR = '[data-entity-side-panel-scroll]';

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, [role="button"], [contenteditable="true"], [data-no-sheet-drag]'
    )
  );
}

// Only start a swipe-to-dismiss drag from a non-interactive area, and not while the sheet's
// own content is scrolled — otherwise the drag would fight scrolling and button taps.
function shouldStartSheetDrag(event: React.PointerEvent, root: HTMLElement): boolean {
  if (isInteractiveDragTarget(event.target)) return false;
  const scrollEl = root.querySelector<HTMLElement>(MOBILE_SHEET_SCROLL_SELECTOR);
  if (scrollEl?.contains(event.target as Node) && scrollEl.scrollTop > 0) return false;
  return true;
}

export function EntitySidePanel() {
  const pathname = usePathname();
  const jotaiStore = useStore();
  const isMobile = useIsMobileLayout();
  const dragControls = useDragControls();
  const setSidePanelHostElement = useSetAtom(entitySidePanelHostElementAtom);
  const { isReviewOpen, bumpReviewVersion } = useDiff();
  const { sidePanelTarget, closeSidePanel } = useEntitySidePanel();
  const [createPostFlow, setCreatePostFlow] = useAtom(createPostFlowAtom);
  const { setEditable } = useEditable();

  const panelHostRef = React.useCallback(
    (node: HTMLElement | null) => {
      setSidePanelHostElement(node);
    },
    [setSidePanelHostElement]
  );
  const pathnameWhenOpenedRef = React.useRef<string | null>(null);
  const reviewEditsSnapshotRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!sidePanelTarget) {
      reviewEditsSnapshotRef.current = null;
      return;
    }
    if (sidePanelTarget.openedFromReviewEdits) {
      reviewEditsSnapshotRef.current = getLocalUnpublishedChangesFingerprint();
    }
  }, [sidePanelTarget]);

  const handleCloseSidePanel = React.useCallback(() => {
    const openedFromReviewEdits = sidePanelTarget?.openedFromReviewEdits;

    if (openedFromReviewEdits) {
      const snapshot = reviewEditsSnapshotRef.current;
      const beforePersist = getLocalUnpublishedChangesFingerprint();
      jotaiStore.get(entitySidePanelPersistEditorAtom)?.();
      const afterPersist = getLocalUnpublishedChangesFingerprint();
      const hasSemanticChanges = snapshot !== null && (beforePersist !== snapshot || afterPersist !== snapshot);
      if (hasSemanticChanges) {
        bumpReviewVersion();
      }
      reviewEditsSnapshotRef.current = null;
    }

    if (shouldClearMainEditOnSidePanelClose(createPostFlow, sidePanelTarget)) {
      setEditable(false);
      setCreatePostFlow(createPostFlowComplete(createPostFlow));
    }

    closeSidePanel();
  }, [bumpReviewVersion, closeSidePanel, createPostFlow, jotaiStore, setCreatePostFlow, setEditable, sidePanelTarget]);

  React.useEffect(() => {
    if (!sidePanelTarget) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      event.preventDefault();
      handleCloseSidePanel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidePanelTarget, handleCloseSidePanel]);

  React.useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    if (!sidePanelTarget) {
      html.removeAttribute('data-entity-side-panel-open');
      body.removeAttribute('data-entity-side-panel-open');
      return;
    }

    html.setAttribute('data-entity-side-panel-open', '');
    body.setAttribute('data-entity-side-panel-open', '');
    let restoreScrollbars = hideMainPageScrollbars();
    const rafId = requestAnimationFrame(() => {
      restoreScrollbars();
      restoreScrollbars = hideMainPageScrollbars();
    });

    return () => {
      cancelAnimationFrame(rafId);
      restoreScrollbars();
      html.removeAttribute('data-entity-side-panel-open');
      body.removeAttribute('data-entity-side-panel-open');
    };
  }, [sidePanelTarget]);

  React.useEffect(() => {
    if (!sidePanelTarget) {
      pathnameWhenOpenedRef.current = null;
      return;
    }

    if (pathnameWhenOpenedRef.current === null) {
      pathnameWhenOpenedRef.current = pathname;
      return;
    }

    if (pathnameWhenOpenedRef.current !== pathname) {
      pathnameWhenOpenedRef.current = null;
      if (!shouldSuppressSidePanelPathnameAutoClose(createPostFlow)) {
        handleCloseSidePanel();
      }
    }
  }, [createPostFlow, pathname, sidePanelTarget, handleCloseSidePanel]);

  // Close when clicking outside the panel. Capture phase so it beats descendant
  // handlers that stopPropagation. Openers switch the panel instead of closing;
  // popovers/menus/dialogs portaled out of the panel are ignored.
  React.useEffect(() => {
    if (!sidePanelTarget) return;
    // The review modal opens and switches this panel; let it own its dismissal
    // instead of closing on every click within it.
    if (sidePanelTarget.openedFromReviewEdits) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (
        target.closest(
          '[data-entity-side-panel], [data-power-tools-entity-panel], [data-entity-side-panel-opener], [data-radix-popper-content-wrapper], [data-radix-portal], [role="dialog"], [role="menu"], [role="listbox"], .elevated-popover, .side-panel-elevated-popover'
        )
      ) {
        return;
      }

      handleCloseSidePanel();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [sidePanelTarget, handleCloseSidePanel]);

  if (!sidePanelTarget) {
    return null;
  }

  if (typeof document === 'undefined' || !document.body) {
    return null;
  }

  const { entityId, spaceId, openedWithMainViewEditing, openedFromReviewEdits } = sidePanelTarget;

  const panelBody = (
    <EntitySidePanelPopoverPortalProvider>
      <EntitySidePanelSurface
        entityId={entityId}
        requestedSpaceId={spaceId}
        openedWithMainViewEditing={openedWithMainViewEditing}
        openedFromReviewEdits={openedFromReviewEdits}
        onClose={handleCloseSidePanel}
      />
    </EntitySidePanelPopoverPortalProvider>
  );

  if (isMobile) {
    return createPortal(
      <motion.div
        className={cx('fixed inset-0', isReviewOpen ? 'z-[10001]' : 'z-[200]')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        onPointerDown={event => {
          if (shouldStartSheetDrag(event, event.currentTarget)) dragControls.start(event);
        }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-grey-04/50"
          onClick={handleCloseSidePanel}
          aria-label="Close"
        />
        <motion.div
          ref={panelHostRef as React.Ref<HTMLDivElement>}
          data-entity-side-panel
          role="dialog"
          aria-modal="true"
          aria-label="Entity side panel"
          drag="y"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.12}
          onDragEnd={(_event, info: PanInfo) => {
            if (info.offset.y > 72 || info.velocity.y > 420) handleCloseSidePanel();
          }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          className="rounded-t-2xl shadow-2xl absolute inset-x-0 bottom-0 z-1 flex flex-col overflow-hidden bg-white"
          style={{ top: MOBILE_SHEET_TOP_OFFSET_PX }}
        >
          <div className="flex shrink-0 justify-center pt-2 pb-1" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-grey-02" />
          </div>
          {panelBody}
        </motion.div>
      </motion.div>,
      document.body
    );
  }

  return createPortal(
    <aside
      ref={panelHostRef}
      data-entity-side-panel
      className={cx(
        'rounded-l-2xl shadow-2xl fixed inset-y-0 right-0 flex w-[min(600px,100vw)] shrink-0 flex-col overflow-hidden border-l border-grey-02 bg-white',
        isReviewOpen ? 'z-[10001]' : 'z-[200]'
      )}
    >
      {panelBody}
    </aside>,
    document.body
  );
}
