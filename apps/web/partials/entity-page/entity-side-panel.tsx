'use client';

import * as React from 'react';

import { motion, useAnimation } from 'framer-motion';
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { getLocalUnpublishedChangesFingerprint } from '~/core/hooks/use-local-changes';
import { useSidePanelEntityScope } from '~/core/hooks/use-side-panel-entity-scope';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSpace } from '~/core/hooks/use-space';
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

import { Divider } from '~/design-system/divider';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { BulkEdit } from '~/design-system/icons/bulk-edit';
import { CloseSidePanel } from '~/design-system/icons/close-side-panel';
import { EyeSmall } from '~/design-system/icons/eye-small';
import { Fullscreen } from '~/design-system/icons/full-screen';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

import { EntityPageBody } from '~/partials/entity-page/entity-page-body';
import { useEntityPageSurfaceData } from '~/partials/entity-page/hooks/use-entity-page-surface-data';

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

function AnimatedTogglePill({ controls }: { controls: ReturnType<typeof useAnimation> }) {
  return (
    <motion.div
      animate={controls}
      variants={variants}
      transition={{
        duration: 0.5,
        type: 'spring',
        bounce: 0,
      }}
      layoutId="entity-side-panel-edit-toggle-pill"
      className="absolute h-5 w-7 rounded-[44px] bg-white shadow-dropdown"
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
    <button
      type="button"
      onClick={onToggle}
      aria-label={editable ? 'Switch to view mode' : 'Switch to edit mode'}
      className="flex w-[66px] shrink-0 items-center justify-between rounded-[47px] bg-divider p-1"
    >
      <div className="relative flex h-5 w-7 items-center justify-center rounded-[44px]">
        {!editable && <AnimatedTogglePill controls={controls} />}
        <motion.div
          animate={controls}
          variants={variants}
          className={`z-10 transition-colors duration-300 ${!editable ? 'text-text' : 'text-grey-03'}`}
        >
          <EyeSmall />
        </motion.div>
      </div>
      <div className="relative flex h-5 w-7 items-center justify-center rounded-[44px]">
        {editable && <AnimatedTogglePill controls={controls} />}
        <div
          className={`z-10 transition-colors duration-300 ${editable ? 'text-text' : canEditSpace ? 'text-grey-03' : 'text-grey-04'}`}
        >
          <BulkEdit />
        </div>
      </div>
    </button>
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
  const { space } = useSpace(entitySpaceId);

  const displayName = space?.entity?.name ?? 'Space';
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

      <Link
        href={NavUtils.toSpace(entitySpaceId)}
        spaceId={entitySpaceId}
        className="flex max-w-[min(100%,14rem)] min-w-0 shrink items-center gap-1.5 rounded-sm px-1 py-1"
      >
        <div className="relative h-4 w-4 shrink-0 overflow-hidden rounded-sm">
          <ThumbGeoImage
            value={space?.entity?.image || PLACEHOLDER_SPACE_IMAGE}
            alt=""
            loading="eager"
            fetchPriority="high"
          />
        </div>
        <Divider type="vertical" className="inline-block h-4 w-px shrink-0" />
        <Truncate shouldTruncate variant="breadcrumb" maxLines={1} className="min-w-0 font-medium">
          {displayName}
        </Truncate>
      </Link>

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
}: {
  entityId: string;
  entitySpaceId: string;
  entity: Entity | null;
  isLoadingEntity: boolean;
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
        />
      </SidePanelEditorProvider>
    </EntityStoreProvider>
  );
}

function EntitySidePanelSurface({
  entityId,
  requestedSpaceId,
  openedWithMainViewEditing,
  openedFromReviewEdits,
  onClose,
}: {
  entityId: string;
  requestedSpaceId: string;
  openedWithMainViewEditing: boolean;
  openedFromReviewEdits?: boolean;
  onClose: () => void;
}) {
  const { entity, effectiveSpaceId, isLoading } = useSidePanelEntityScope(entityId, requestedSpaceId);
  const editorContentVersion = useAtomValue(editorContentVersionAtom);

  return (
    <EntitySidePanelEditModeProvider
      entitySpaceId={effectiveSpaceId}
      openedWithMainViewEditing={openedWithMainViewEditing}
      openedFromReviewEdits={openedFromReviewEdits}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <EntitySidePanelHeader entityId={entityId} entitySpaceId={effectiveSpaceId} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <EntitySidePanelActiveTabProvider entityId={entityId}>
            <EntitySidePanelBody
              key={`${effectiveSpaceId}:${entityId}:${editorContentVersion}`}
              entityId={entityId}
              entitySpaceId={effectiveSpaceId}
              entity={entity}
              isLoadingEntity={isLoading}
            />
          </EntitySidePanelActiveTabProvider>
        </div>
      </div>
    </EntitySidePanelEditModeProvider>
  );
}

export function EntitySidePanel() {
  const pathname = usePathname();
  const jotaiStore = useStore();
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

  if (!sidePanelTarget) {
    return null;
  }

  if (typeof document === 'undefined' || !document.body) {
    return null;
  }

  const { entityId, spaceId, openedWithMainViewEditing, openedFromReviewEdits } = sidePanelTarget;

  return createPortal(
    <aside
      ref={panelHostRef}
      data-entity-side-panel
      className={`rounded-l-2xl shadow-2xl fixed inset-y-0 right-0 flex w-[min(600px,100vw)] shrink-0 flex-col overflow-hidden border-l border-grey-02 bg-white ${
        isReviewOpen ? 'z-[10001]' : 'z-[200]'
      }`}
    >
      <EntitySidePanelPopoverPortalProvider>
        <EntitySidePanelSurface
          entityId={entityId}
          requestedSpaceId={spaceId}
          openedWithMainViewEditing={openedWithMainViewEditing}
          openedFromReviewEdits={openedFromReviewEdits}
          onClose={handleCloseSidePanel}
        />
      </EntitySidePanelPopoverPortalProvider>
    </aside>,
    document.body
  );
}
