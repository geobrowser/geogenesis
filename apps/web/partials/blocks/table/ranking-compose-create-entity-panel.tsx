'use client';

import * as React from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useAtom, useSetAtom,  useStore } from 'jotai';
import { createPortal } from 'react-dom';

import { filterLocalChangesToEntitySubgraph } from '~/core/blocks/ranking/ranking-compose-create-entity';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { usePublish } from '~/core/hooks/use-publish';
import { EntitySidePanelPopoverPortalProvider } from '~/core/state/entity-side-panel-popover-portal';
import { useRelations, useValues } from '~/core/sync/use-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { Entities } from '~/core/utils/entity';
import { hideMainPageScrollbars } from '~/core/utils/hide-main-scrollbars';

import { EntitySidePanelSurface } from '~/partials/entity-page/entity-side-panel';

import { RankingComposeCreateEntityHeader } from './ranking-compose-create-entity-header';
import { entitySidePanelPersistEditorAtom, rankingComposeRemoveScrollShardAtom } from '~/atoms';
import { rankingComposeCreateEntityAtom } from '~/atoms/ranking-compose-create-entity';

type Props = {
  onFinished: (entityId: string) => void;
  rankingName: string;
};

export function RankingComposeCreateEntityPanel({ onFinished, rankingName }: Props) {
  const isMobile = useIsMobileLayout();
  const jotaiStore = useStore();
  const [flow, setFlow] = useAtom(rankingComposeCreateEntityAtom);
  const setRemoveScrollShard = useSetAtom(rankingComposeRemoveScrollShardAtom);
  const { store } = useSyncEngine();
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();
  const [isPublishing, setIsPublishing] = React.useState(false);

  const panelOverlayRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (isMobile) {
        setRemoveScrollShard(node);
      }
    },
    [isMobile, setRemoveScrollShard]
  );

  React.useLayoutEffect(() => {
    if (!flow && isMobile) {
      setRemoveScrollShard(null);
    }
  }, [flow, isMobile, setRemoveScrollShard]);

  React.useLayoutEffect(() => {
    return () => setRemoveScrollShard(null);
  }, [setRemoveScrollShard]);

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
    if (!flow || isPublishing) return;

    jotaiStore.get(entitySidePanelPersistEditorAtom)?.();

    const entityId = flow.entityId;
    const publishSpaceId = flow.publishSpaceId;
    const { values, relations } = filterLocalChangesToEntitySubgraph(entityId, localValues, localRelations);

    if (values.length === 0 && relations.length === 0) {
      handleClose();
      onFinished(entityId);
      return;
    }

    const entityName = Entities.name(values)?.trim() || 'Untitled';
    const proposalName = `${rankingName.trim() || 'Ranking'} - Create new - ${entityName}`;

    setIsPublishing(true);
    void makeProposal({
      values,
      relations,
      spaceId: publishSpaceId,
      name: proposalName,
      onSuccess: () => {
        setIsPublishing(false);
        void queryClient.invalidateQueries({ queryKey: ['ranking-pending-entities'] });
        handleClose();
        onFinished(entityId);
      },
      onError: () => {
        setIsPublishing(false);
      },
    });
  }, [
    flow,
    isPublishing,
    localValues,
    localRelations,
    makeProposal,
    queryClient,
    jotaiStore,
    handleClose,
    onFinished,
    rankingName,
  ]);

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
          onPublishSpaceIdChange={nextId => setFlow(prev => (prev ? { ...prev, publishSpaceId: nextId } : null))}
          onCancel={handleCancel}
          onFinish={handleFinish}
          isFinishing={isPublishing}
          publishSpaceLocked
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <EntitySidePanelSurface
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
      <div ref={panelOverlayRef} className="fixed inset-0 z-[210]">
        <div aria-hidden className="absolute inset-0 bg-grey-04/50" />
        <aside
          data-ranking-compose-create-entity-panel
          data-entity-side-panel
          className="shadow-2xl absolute inset-x-0 bottom-0 z-1 flex w-full flex-col overflow-hidden rounded-t-2xl bg-white"
          style={{ top: 'calc(var(--ranking-compose-top, 2.75rem) + 8rem)' }}
        >
          {panelBody}
        </aside>
      </div>
    ) : (
      <aside
        data-ranking-compose-create-entity-panel
        data-entity-side-panel
        className="shadow-2xl fixed inset-y-0 right-0 z-[201] flex w-[min(600px,100vw)] shrink-0 flex-col overflow-hidden border-l border-grey-02 bg-white"
      >
        {panelBody}
      </aside>
    ),
    document.body
  );
}
