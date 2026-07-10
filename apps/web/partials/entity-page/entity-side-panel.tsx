'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';
import { motion, useAnimation } from 'framer-motion';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';

import { fetchCollectionItemsForBlocks } from '~/core/blocks/data/fetch-collection-items';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { getLocalUnpublishedChangesFingerprint } from '~/core/hooks/use-local-changes';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useDiff } from '~/core/state/diff-store';
import { EditorProvider, type Tabs } from '~/core/state/editor/editor-provider';
import { useRelationEntityRelations } from '~/core/state/entity-page-store/entity-store';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { EntitySidePanelActiveTabProvider } from '~/core/state/entity-side-panel-active-tab';
import {
  EntitySidePanelEditContext,
  EntitySidePanelEditModeProvider,
} from '~/core/state/entity-side-panel-edit-context';
import { EntitySidePanelPopoverPortalProvider } from '~/core/state/entity-side-panel-popover-portal';
import { useQueryEntities, useQueryEntitiesAsync, useQueryEntity } from '~/core/sync/use-store';
import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';
import type { Entity, TabEntity } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { hideMainPageScrollbars } from '~/core/utils/hide-main-scrollbars';
import { getTopRankedSpaceId } from '~/core/utils/space/space-ranking';
import { useEntityMediaUrl, useImageUrlFromEntity } from '~/core/utils/use-entity-media';
import { NavUtils, sortRelations } from '~/core/utils/utils';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { BulkEdit } from '~/design-system/icons/bulk-edit';
import { CloseSidePanel } from '~/design-system/icons/close-side-panel';
import { EyeSmall } from '~/design-system/icons/eye-small';
import { Fullscreen } from '~/design-system/icons/full-screen';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

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
import { NavbarBreadcrumb } from '~/partials/navbar/navbar-breadcrumb';

import { editorContentVersionAtom, entitySidePanelHostElementAtom, entitySidePanelPersistEditorAtom } from '~/atoms';

const shake = [7, -8.4, 6.3, -10, 8.4, -4.4, 0];

function spaceHasDisplayName(entity: Entity | null | undefined, spaceId: string): boolean {
  if (!entity?.values) return false;
  return entity.values.some(
    value =>
      !value.isDeleted &&
      value.spaceId === spaceId &&
      value.property.id === SystemIds.NAME_PROPERTY &&
      typeof value.value === 'string' &&
      value.value.trim().length > 0
  );
}

/**
 * `GeoStore.getEntity(id, { spaceId })` only keeps triples for that space. If callers pass the
 * block’s space while the row’s data lives in another space, the panel looks empty. Prefer a scope
 * that actually has the entity name — not merely backlinks/votes in the ranking block’s space.
 *
 * When browsing, prefer the top-ranked space where the entity has a name, so a multi-space person
 * opens to their canonical space rather than a personal space that merely references them. When
 * opened for editing (main-view edit / review), honor the requested space so unpublished edits
 * scoped to it stay visible.
 */
function useSidePanelEntityScope(entityId: string, requestedSpaceId: string, preferRequestedSpace: boolean) {
  const { entity: unscopedEntity, isLoading: isLoadingHydration } = useQueryEntity({
    id: entityId,
    enabled: Boolean(entityId),
  });

  const { entity: requestedScoped } = useQueryEntity({
    id: entityId,
    spaceId: requestedSpaceId,
    enabled: Boolean(entityId && requestedSpaceId && preferRequestedSpace),
  });

  const derivedSpaceId = React.useMemo(() => {
    const namedSpaceIds = new Set<string>();
    for (const value of unscopedEntity?.values ?? []) {
      if (
        !value.isDeleted &&
        value.property.id === SystemIds.NAME_PROPERTY &&
        typeof value.value === 'string' &&
        value.value.trim().length > 0
      ) {
        namedSpaceIds.add(value.spaceId);
      }
    }

    return (
      getTopRankedSpaceId([...namedSpaceIds]) ?? getTopRankedSpaceId(unscopedEntity?.spaces ?? []) ?? requestedSpaceId
    );
  }, [unscopedEntity, requestedSpaceId]);

  const effectiveSpaceId = React.useMemo(() => {
    if (preferRequestedSpace && spaceHasDisplayName(requestedScoped, requestedSpaceId)) {
      return requestedSpaceId;
    }
    return derivedSpaceId;
  }, [derivedSpaceId, preferRequestedSpace, requestedScoped, requestedSpaceId]);

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
          className={cx('z-10 transition-colors duration-300', !editable ? 'text-text' : 'text-grey-03')}
        >
          <EyeSmall />
        </motion.div>
      </div>
      <div className="relative flex h-5 w-7 items-center justify-center rounded-[44px]">
        {editable && <AnimatedTogglePill controls={controls} />}
        <div
          className={cx(
            'z-10 transition-colors duration-300',
            editable ? 'text-text' : canEditSpace ? 'text-grey-03' : 'text-grey-04'
          )}
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
  const entityMediaUrl = useEntityMediaUrl(entityId, entitySpaceId);
  const previewImageResolvedUrl = useImageUrlFromEntity(
    previewImageUrl && !previewImageUrl.startsWith('ipfs://') && !previewImageUrl.startsWith('http')
      ? previewImageUrl
      : undefined,
    entitySpaceId
  );
  const previewImageUrlResolved =
    previewImageUrl?.startsWith('ipfs://') || previewImageUrl?.startsWith('http')
      ? previewImageUrl
      : (previewImageResolvedUrl ?? previewImageUrl);

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

  const avatarUrl = Entities.avatar(entity.relations) ?? entityMediaUrl ?? previewImageUrlResolved ?? null;
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
          <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />
          <EntityPageContentContainer>
            <div>
              <div className="space-y-2">
                <div className="[&_.line-clamp-1]:!line-clamp-none [&_.line-clamp-2]:!line-clamp-none [&_.line-clamp-3]:!line-clamp-none [&_.line-clamp-4]:!line-clamp-none [&_.line-clamp-5]:!line-clamp-none [&_.line-clamp-6]:!line-clamp-none">
                  <EditableHeading spaceId={entitySpaceId} entityId={entityId} fallbackName={previewName} />
                </div>
                {!isRelationPage && (
                  <EntityPageInlineDescription
                    entityId={entityId}
                    spaceId={entitySpaceId}
                    truncate={false}
                    fallbackDescription={previewDescription}
                  />
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
      const hasSemanticChanges = snapshot !== null && (beforePersist !== snapshot || afterPersist !== snapshot);
      if (hasSemanticChanges) {
        bumpReviewVersion();
      }
      reviewEditsSnapshotRef.current = null;
    }

    closeSidePanel();
  }, [bumpReviewVersion, closeSidePanel, jotaiStore, sidePanelTarget?.openedFromReviewEdits]);

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
      handleCloseSidePanel();
    }
  }, [pathname, sidePanelTarget, handleCloseSidePanel]);

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
          '[data-entity-side-panel], [data-entity-side-panel-opener], [data-radix-popper-content-wrapper], [data-radix-portal], [role="dialog"], [role="menu"], [role="listbox"], .elevated-popover, .side-panel-elevated-popover'
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

  return createPortal(
    <aside
      ref={panelHostRef}
      data-entity-side-panel
      className={cx(
        'rounded-l-2xl shadow-2xl fixed inset-y-0 right-0 flex w-[min(600px,100vw)] shrink-0 flex-col overflow-hidden border-l border-grey-02 bg-white',
        isReviewOpen ? 'z-[10001]' : 'z-[200]'
      )}
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
