'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';
import { createPortal } from 'react-dom';

import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { usePathname } from 'next/navigation';

import { motion, useAnimation } from 'framer-motion';

import {
  editorContentVersionAtom,
  entitySidePanelHostElementAtom,
  entitySidePanelPersistEditorAtom,
} from '~/atoms';

import { fetchCollectionItemsForBlocks } from '~/core/blocks/data/fetch-collection-items';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { getLocalUnpublishedChangesFingerprint } from '~/core/hooks/use-local-changes';
import { useDiff } from '~/core/state/diff-store';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSpace } from '~/core/hooks/use-space';
import { EditorProvider, type Tabs } from '~/core/state/editor/editor-provider';
import { EntitySidePanelActiveTabProvider } from '~/core/state/entity-side-panel-active-tab';
import { EntitySidePanelEditModeProvider, EntitySidePanelEditContext } from '~/core/state/entity-side-panel-edit-context';
import { EntitySidePanelPopoverPortalProvider } from '~/core/state/entity-side-panel-popover-portal';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { useRelationEntityRelations } from '~/core/state/entity-page-store/entity-store';
import type { Entity, TabEntity } from '~/core/types';
import { useQueryEntities, useQueryEntitiesAsync, useQueryEntity } from '~/core/sync/use-store';
import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';
import { Entities } from '~/core/utils/entity';
import { hideMainPageScrollbars } from '~/core/utils/hide-main-scrollbars';
import { NavUtils, sortRelations } from '~/core/utils/utils';

import { Divider } from '~/design-system/divider';
import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { BulkEdit } from '~/design-system/icons/bulk-edit';
import { CloseSidePanel } from '~/design-system/icons/close-side-panel';
import { EyeSmall } from '~/design-system/icons/eye-small';
import { Fullscreen } from '~/design-system/icons/full-screen';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

import { CommentSection } from '~/partials/comments/comments-section';
import { Editor } from '~/partials/editor/editor';
import { BacklinksClientContainer } from '~/partials/entity-page/backlinks-client-container';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageInlineDescription } from '~/partials/entity-page/entity-page-inline-description';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { EntityTabs } from '~/partials/entity-page/entity-tabs';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';

const shake = [7, -8.4, 6.3, -10, 8.4, -4.4, 0];

/**
 * `GeoStore.getEntity(id, { spaceId })` only keeps triples for that space. If callers pass the
 * block’s space while the row’s data lives in another space, the panel looks empty. We prefer the
 * requested scope when it has content; otherwise we derive a space from unscoped entity data.
 */
function useSidePanelEntityScope(entityId: string, requestedSpaceId: string) {
  const { entity: unscopedEntity, isLoading: isLoadingHydration } = useQueryEntity({
    id: entityId,
    enabled: Boolean(entityId),
  });

  const { entity: requestedScoped } = useQueryEntity({
    id: entityId,
    spaceId: requestedSpaceId,
    enabled: Boolean(entityId && requestedSpaceId),
  });

  const scopedHasContent = React.useMemo(() => {
    if (!requestedScoped) return false;
    return (
      requestedScoped.values.length > 0 || requestedScoped.relations.some(r => !r.isDeleted)
    );
  }, [requestedScoped]);

  const derivedSpaceId = React.useMemo(() => {
    const v = unscopedEntity?.values.find(x => !x.isDeleted)?.spaceId;
    const r = unscopedEntity?.relations.find(rel => !rel.isDeleted)?.spaceId;
    return v ?? r ?? requestedSpaceId;
  }, [unscopedEntity, requestedSpaceId]);

  const effectiveSpaceId = scopedHasContent ? requestedSpaceId : derivedSpaceId;

  const { entity, isLoading: isLoadingScopedView } = useQueryEntity({
    id: entityId,
    spaceId: effectiveSpaceId,
    enabled: Boolean(entityId && effectiveSpaceId),
  });

  const isLoading = isLoadingHydration || isLoadingScopedView;

  return { entity, effectiveSpaceId, isLoading };
}

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
        className="flex min-w-0 max-w-[min(100%,14rem)] shrink items-center gap-1.5 rounded-sm px-1 py-1"
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
  const relationEntityRelations = useRelationEntityRelations(entityId, entitySpaceId);
  const isRelationPage = relationEntityRelations.length > 0;

  const blockRelations = React.useMemo(() => {
    return entity?.relations?.filter(r => r.type.id === SystemIds.BLOCKS) ?? [];
  }, [entity]);

  const blockIds = React.useMemo(() => blockRelations.map(r => r.toEntity.id), [blockRelations]);

  const { entities: blocks, isLoading: isBlocksLoading } = useQueryEntities({
    where: {
      id: { in: blockIds },
    },
    enabled: blockIds.length > 0,
    first: Math.max(blockIds.length, 9),
  });

  const tabRelations = React.useMemo(() => {
    if (!entity?.relations) return [];
    return sortRelations(entity.relations.filter(r => r.type.id === SystemIds.TABS_PROPERTY));
  }, [entity]);

  const tabIds = React.useMemo(() => tabRelations.map(r => r.toEntity.id), [tabRelations]);

  const { entities: syncedTabEntities, isLoading: loadingTabEntities } = useQueryEntities({
    where: { id: { in: tabIds } },
    enabled: Boolean(entity && tabIds.length > 0),
    first: Math.max(tabIds.length, 9),
  });

  const tabEntitiesOrdered = React.useMemo(() => {
    if (tabIds.length === 0) return [];
    const list = syncedTabEntities ?? [];
    const map = new Map(list.map(e => [e.id, e]));
    return tabIds.map(id => map.get(id)).filter((e): e is Entity => e != null);
  }, [syncedTabEntities, tabIds]);

  const nestedTabBlockIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const te of tabEntitiesOrdered) {
      for (const r of te.relations ?? []) {
        if (r.type.id === SystemIds.BLOCKS) {
          ids.add(r.toEntity.id);
          if (r.entityId) ids.add(r.entityId);
        }
      }
    }
    return [...ids];
  }, [tabEntitiesOrdered]);

  const { entities: nestedTabBlockEntities, isLoading: loadingNestedTabBlocks } = useQueryEntities({
    where: { id: { in: nestedTabBlockIds } },
    enabled: nestedTabBlockIds.length > 0,
    first: Math.max(nestedTabBlockIds.length, 9),
  });

  const initialTabs = React.useMemo((): Tabs => {
    const blockMap = new Map((nestedTabBlockEntities ?? []).map(e => [e.id, e]));
    const tabs: Tabs = {};
    for (const te of tabEntitiesOrdered) {
      const blockRels = (te.relations ?? []).filter(r => r.type.id === SystemIds.BLOCKS);
      const orderedIds = [...new Set(blockRels.map(r => r.toEntity.id))];
      tabs[te.id] = {
        entity: te,
        blocks: orderedIds.map(id => blockMap.get(id)).filter((e): e is Entity => e != null),
      };
    }
    return tabs;
  }, [tabEntitiesOrdered, nestedTabBlockEntities]);

  const tabEntitiesForTabsUi = React.useMemo(
    (): TabEntity[] => tabEntitiesOrdered.map(e => ({ id: e.id, name: e.name ?? null })),
    [tabEntitiesOrdered]
  );

  const findMany = useQueryEntitiesAsync();

  const [initialCollectionItems, setInitialCollectionItems] = React.useState<Record<string, Entity[]>>({});

  React.useEffect(() => {
    if (!entity) {
      setInitialCollectionItems({});
      return;
    }
    if (loadingTabEntities || loadingNestedTabBlocks) return;

    const overviewBlocks = blocks ?? [];
    const tabBlocksFlat = Object.values(initialTabs).flatMap(t => t.blocks);
    const mergedBlocks = [...overviewBlocks, ...tabBlocksFlat];
    if (mergedBlocks.length === 0) {
      setInitialCollectionItems({});
      return;
    }

    let cancelled = false;
    fetchCollectionItemsForBlocks(
      mergedBlocks,
      async ids => {
        if (ids.length === 0) return [];
        return findMany({ where: { id: { in: ids } }, first: Math.max(ids.length, 9) });
      },
      entitySpaceId
    ).then(items => {
      if (!cancelled) setInitialCollectionItems(items);
    });

    return () => {
      cancelled = true;
    };
  }, [entity, blocks, initialTabs, loadingTabEntities, loadingNestedTabBlocks, entitySpaceId, findMany]);

  const isPanelLoading = (isLoadingEntity && !entity) || isBlocksLoading;

  if (isPanelLoading) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-24 sm:px-5">
        <Text variant="body" color="grey-04">
          Loading entity…
        </Text>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-24 sm:px-5">
        <Text variant="body" color="grey-04">
          Could not load this entity in this space. Try opening it full page from the link in the header.
        </Text>
      </div>
    );
  }

  const avatarUrl = Entities.avatar(entity.relations);
  const coverUrl = Entities.cover(entity.relations);

  return (
    <EntityStoreProvider id={entityId} spaceId={entitySpaceId}>
        <EditorProvider
          id={entityId}
          spaceId={entitySpaceId}
          initialBlocks={blocks ?? []}
          initialBlockRelations={blockRelations}
          initialTabs={initialTabs}
          initialCollectionItems={initialCollectionItems}
        >
          <div className="px-4 pt-6 pb-12 sm:px-5">
          <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} fitImage />
          <EntityPageContentContainer>
            <div>
              <div className="space-y-2">
                <div className="[&_.line-clamp-1]:!line-clamp-none [&_.line-clamp-2]:!line-clamp-none [&_.line-clamp-3]:!line-clamp-none [&_.line-clamp-4]:!line-clamp-none [&_.line-clamp-5]:!line-clamp-none [&_.line-clamp-6]:!line-clamp-none">
                  <EditableHeading spaceId={entitySpaceId} entityId={entityId} />
                </div>
                {!isRelationPage && (
                  <EntityPageInlineDescription entityId={entityId} spaceId={entitySpaceId} truncate={false} />
                )}
                {!isRelationPage && <EntityPageMetadataHeader id={entityId} spaceId={entitySpaceId} isVoteable />}
              </div>
              <Spacer height={40} />
              <React.Suspense fallback={null}>
                <EntityTabs
                  entityId={entityId}
                  spaceId={entitySpaceId}
                  initialTabRelations={tabRelations}
                  tabEntities={tabEntitiesForTabsUi}
                />
              </React.Suspense>
              <Spacer height={40} />
              <Editor spaceId={entitySpaceId} shouldHandleOwnSpacing />
              <ToggleEntityPage id={entityId} spaceId={entitySpaceId} />
              <Spacer height={40} />
              <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
                <BacklinksClientContainer entityId={entityId} />
              </TrackedErrorBoundary>
              <CommentSection entityId={entityId} spaceId={entitySpaceId} />
            </div>
          </EntityPageContentContainer>
          </div>
        </EditorProvider>
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
      const hasSemanticChanges =
        snapshot !== null && (beforePersist !== snapshot || afterPersist !== snapshot);
      if (hasSemanticChanges) {
        bumpReviewVersion();
      }
      reviewEditsSnapshotRef.current = null;
    }

    closeSidePanel();
  }, [bumpReviewVersion, closeSidePanel, jotaiStore, sidePanelTarget?.openedFromReviewEdits]);

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
      handleCloseSidePanel();
    }
  }, [pathname, sidePanelTarget, handleCloseSidePanel]);

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
      className={`fixed inset-y-0 right-0 flex w-[min(600px,100vw)] shrink-0 flex-col overflow-hidden rounded-l-2xl border-l border-grey-02 bg-white shadow-2xl ${
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
