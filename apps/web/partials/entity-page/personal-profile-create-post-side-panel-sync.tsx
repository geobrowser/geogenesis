'use client';

import * as React from 'react';

import { useAtom } from 'jotai';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { useEditable } from '~/core/state/editable-store';
import {
  createPostFlowAdvanceToOpeningPanel,
  createPostFlowPanelOpened,
  createPostFlowPostsTabUrl,
  isCreatePostNavigationReady,
  isOnCreatePostProfileSurface,
} from '~/core/state/personal-profile/create-post-flow';

import { createPostFlowAtom, personalProfileSuggestedTasksAtom } from '~/atoms/personal-profile-suggested';

/**
 * Completes the "Create post" flow after the getting-started card fires.
 * Lives at app root so navigation + side panel survive layout unmounts.
 */
export function PersonalProfileCreatePostSidePanelSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { openSidePanel } = useEntitySidePanel();
  const { setEditable } = useEditable();
  const [flow, setFlow] = useAtom(createPostFlowAtom);
  const setSuggestedTasks = useAtom(personalProfileSuggestedTasksAtom)[1];

  React.useEffect(() => {
    if (flow.phase === 'idle') return;

    const { payload } = flow;
    const postsTabUrl = createPostFlowPostsTabUrl(payload);
    const tabId = searchParams?.get('tabId');

    if (flow.phase === 'pending') {
      if (!isOnCreatePostProfileSurface(pathname, payload)) {
        void router.push(postsTabUrl, { scroll: false });
        return;
      }

      if (!isCreatePostNavigationReady(pathname, tabId, payload)) {
        void router.replace(postsTabUrl, { scroll: false });
        return;
      }

      setFlow(createPostFlowAdvanceToOpeningPanel(flow));
      return;
    }

    if (flow.phase === 'openingPanel') {
      const frame = requestAnimationFrame(() => {
        openSidePanel(payload.postEntityId, payload.spaceId, true);
        setSuggestedTasks(t => ({ ...t, post: true }));
        setFlow(createPostFlowPanelOpened(flow));
      });

      return () => cancelAnimationFrame(frame);
    }
  }, [flow, openSidePanel, pathname, router, searchParams, setFlow, setSuggestedTasks]);

  React.useEffect(() => {
    if (flow.phase !== 'panelOpen') return;
    setEditable(false);
  }, [flow.phase, setEditable]);

  return null;
}
