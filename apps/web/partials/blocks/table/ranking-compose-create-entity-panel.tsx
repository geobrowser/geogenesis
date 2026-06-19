'use client';

import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useAtom, useSetAtom, useStore } from 'jotai';
import { createPortal } from 'react-dom';

import { filterLocalChangesToEntitySubgraph } from '~/core/blocks/ranking/ranking-compose-create-entity';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { EntitySidePanelPopoverPortalProvider } from '~/core/state/entity-side-panel-popover-portal';
import { reactiveRelations, reactiveValues } from '~/core/sync/store';
import { useMutate } from '~/core/sync/use-mutate';
import { useRelations, useValues } from '~/core/sync/use-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { hideMainPageScrollbars } from '~/core/utils/hide-main-scrollbars';

import { EntitySidePanelSurface } from '~/partials/entity-page/entity-side-panel';

import { RankingComposeCreateEntityHeader } from './ranking-compose-create-entity-header';
import { entitySidePanelPersistEditorAtom, rankingComposeRemoveScrollShardAtom } from '~/atoms';
import { rankingComposeCreateEntityAtom } from '~/atoms/ranking-compose-create-entity';

type Props = {
  onFinished: (entityId: string) => void;
};

export function RankingComposeCreateEntityPanel({ onFinished }: Props) {
  const isMobile = useIsMobileLayout();
  const jotaiStore = useStore();
  const [flow, setFlow] = useAtom(rankingComposeCreateEntityAtom);
  const { store } = useSyncEngine();
  const { storage } = useMutate();

  const setRemoveScrollShard = useSetAtom(rankingComposeRemoveScrollShardAtom);
  const shardRef = React.useCallback(
    (node: HTMLElement | null) => setRemoveScrollShard(node),
    [setRemoveScrollShard]
  );
  React.useLayoutEffect(() => () => setRemoveScrollShard(null), [setRemoveScrollShard]);

  const publishSpaceId = flow?.publishSpaceId ?? '';

  const localValues = useValues({
    selector: v => v.spaceId === publishSpaceId && v.isLocal === true && v.hasBeenPublished === false,
  });

  const localRelations = useRelations({
    selector: r => r.spaceId === publishSpaceId && r.isLocal === true && r.hasBeenPublished === false,
  });

  const handleClose = React.useCallback(() => {
    setFlow(null);
  }, [setFlow]);

  const handlePublishSpaceChange = React.useCallback(
    (nextSpaceId: string) => {
      if (!flow || nextSpaceId === flow.publishSpaceId) return;
      const oldSpaceId = flow.publishSpaceId;

      jotaiStore.get(entitySidePanelPersistEditorAtom)?.();

      const oldValues = reactiveValues
        .get()
        .filter(v => v.spaceId === oldSpaceId && v.isLocal === true && v.hasBeenPublished === false);
      const oldRelations = reactiveRelations
        .get()
        .filter(r => r.spaceId === oldSpaceId && r.isLocal === true && r.hasBeenPublished === false);

      const { values, relations } = filterLocalChangesToEntitySubgraph(flow.entityId, oldValues, oldRelations);

      for (const value of values) {
        storage.values.set({ ...value, spaceId: nextSpaceId });
      }
      for (const relation of relations) {
        storage.relations.set({
          ...relation,
          id: IdUtils.generate(),
          entityId: IdUtils.generate(),
          spaceId: nextSpaceId,
        });
      }

      store.clearLocalChangesByIds({
        spaceId: oldSpaceId,
        valueIds: values.map(v => v.id),
        relationIds: relations.map(r => r.id),
      });

      setFlow(prev => (prev ? { ...prev, publishSpaceId: nextSpaceId } : null));
    },
    [flow, jotaiStore, setFlow, storage, store]
  );

  const discardDraft = React.useCallback(() => {
    if (!flow) return;

    const { values, relations } = filterLocalChangesToEntitySubgraph(flow.entityId, localValues, localRelations);

    store.clearLocalChangesByIds({
      spaceId: flow.publishSpaceId,
      valueIds: values.map(v => v.id),
      relationIds: relations.map(r => r.id),
    });
  }, [flow, localRelations, localValues, store]);

  const handleCancel = React.useCallback(() => {
    discardDraft();
    handleClose();
  }, [discardDraft, handleClose]);

  const handleFinish = React.useCallback(() => {
    if (!flow) return;

    jotaiStore.get(entitySidePanelPersistEditorAtom)?.();
    handleClose();
    onFinished(flow.entityId);
  }, [flow, handleClose, jotaiStore, onFinished]);

  const flowRef = React.useRef(flow);
  flowRef.current = flow;
  const discardDraftRef = React.useRef(discardDraft);
  discardDraftRef.current = discardDraft;

  React.useEffect(() => {
    return () => {
      if (!flowRef.current) return;
      discardDraftRef.current();
      setFlow(null);
    };
  }, [setFlow]);

  React.useLayoutEffect(() => {
    if (!flow) return;

    const html = document.documentElement;
    const body = document.body;

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
  }, [flow]);

  if (!flow || typeof document === 'undefined' || !document.body) {
    return null;
  }

  const panelBody = (
    <EntitySidePanelPopoverPortalProvider>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <RankingComposeCreateEntityHeader
          publishSpaceIds={flow.publishSpaceIds}
          publishSpaceId={flow.publishSpaceId}
          onPublishSpaceIdChange={handlePublishSpaceChange}
          onCancel={handleCancel}
          onFinish={handleFinish}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <EntitySidePanelSurface
            key={flow.publishSpaceId}
            entityId={flow.entityId}
            requestedSpaceId={flow.publishSpaceId}
            openedWithMainViewEditing
            showHeader={false}
            onClose={handleCancel}
          />
        </div>
      </div>
    </EntitySidePanelPopoverPortalProvider>
  );

  return createPortal(
    isMobile ? (
      <>
        <div aria-hidden className="fixed inset-0 z-[200] bg-grey-04/50" />
        <aside
          ref={shardRef}
          data-ranking-compose-create-entity-panel
          className="rounded-t-2xl shadow-2xl fixed inset-x-0 bottom-0 z-[201] flex w-full flex-col overflow-hidden bg-white"
          style={{ top: 'calc(var(--ranking-compose-top, 2.75rem) + 8rem)' }}
        >
          {panelBody}
        </aside>
      </>
    ) : (
      <aside
        ref={shardRef}
        data-ranking-compose-create-entity-panel
        className="shadow-2xl fixed inset-y-0 right-0 z-[201] flex w-[min(600px,100vw)] shrink-0 flex-col overflow-hidden border-l border-grey-02 bg-white"
      >
        {panelBody}
      </aside>
    ),
    document.body
  );
}
