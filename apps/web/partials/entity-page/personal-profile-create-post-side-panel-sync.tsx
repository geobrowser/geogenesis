'use client';

import { useAtom } from 'jotai';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { useEditable } from '~/core/state/editable-store';
import {
  pendingCreatePostSidePanelAtom,
  personalProfileSuggestedTasksAtom,
} from '~/atoms/personal-profile-suggested';

/**
 * Completes the "Create post" flow after the getting-started card fires.
 */
export function PersonalProfileCreatePostSidePanelSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { openSidePanel } = useEntitySidePanel();
  const { setEditable } = useEditable();
  const [pending, setPending] = useAtom(pendingCreatePostSidePanelAtom);
  const setSuggestedTasks = useAtom(personalProfileSuggestedTasksAtom)[1];

  React.useEffect(() => {
    if (!pending) return;

    const { postEntityId, spaceId, profilePathname, postsTabEntityId } = pending;
    const postsTabUrl = `${profilePathname}?tabId=${postsTabEntityId}`;

    const onProfileSurface =
      pathname === profilePathname || pathname === `${profilePathname}/`;
    const tabMatches = searchParams?.get('tabId') === postsTabEntityId;

    if (!onProfileSurface) {
      void router.push(postsTabUrl, { scroll: false });
      return;
    }

    if (!tabMatches) {
      void router.replace(postsTabUrl, { scroll: false });
      return;
    }

    setEditable(true);
    openSidePanel(postEntityId, spaceId, true);
    setSuggestedTasks(t => ({ ...t, post: true }));
    setPending(null);
  }, [
    openSidePanel,
    pathname,
    pending,
    router,
    searchParams,
    setEditable,
    setPending,
    setSuggestedTasks,
  ]);

  return null;
}
