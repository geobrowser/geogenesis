'use client';

import * as React from 'react';

import type { ActionComponent, ActionScope } from '~/core/action-context';
import { useActionContext } from '~/core/action-context-provider';
import { capture } from '~/core/analytics';
import { observeOperation } from '~/core/analytics-operations';
import { debatesAppDebateUrl } from '~/core/debates/debates-app-url';
import { useToast } from '~/core/hooks/use-toast';
import { pushMarketingEvent } from '~/core/marketing-events';
import { copyShareLink } from '~/core/sharing/share-handoff';
import { createTaggedShareLink } from '~/core/sharing/share-link';

export const COPY_LINK_LABEL = 'Copy link';
export const LINK_COPIED_COPY = 'Link copied!';
export const COPY_LINK_FAILED_COPY = 'Could not copy link.';

export type CopyDebateLinkInput = {
  /** The space the share is counted for (`debate_share_action` requires it). */
  spaceId: string;
  /** The debaters' profile spaces, so the share can tell a debater sharing their own debate. */
  participants?: readonly string[];
  /**
   * Extra `debate_share_action` properties, such as the surface the copy was made from. Never
   * `source` or `session_id`: the analytics runtime owns those names.
   */
  properties?: Record<string, unknown> & { source?: never; session_id?: never };
};

/**
 * Copies a debate's link: the debates-app link with a fresh share tag (GEO-3695), the "Link copied!"
 * toast, and the share's analytics (the share operation, the link handoff, `debate_share_action`
 * and the marketing `geo_share`). The one way to copy a debate's link: the Share sheet's Copy link
 * and the Best debates popup's "…" (GEO-3809) both use it. `component` says which surface did.
 */
export function useCopyDebateLink(component: ActionComponent, debateId: string, scope: ActionScope = {}) {
  const getContext = useActionContext(component, 'debate', debateId, scope);
  const [, setToast] = useToast();

  return React.useCallback(
    async ({ spaceId, participants, properties = {} }: CopyDebateLinkInput) => {
      const context = getContext();
      const operation = observeOperation('share', 'debate', debateId, undefined, context);
      try {
        const link = createTaggedShareLink(debatesAppDebateUrl(debateId), 'debate', debateId, 'copy_link');
        await copyShareLink(link, { ...context, space_id: spaceId }, participants);
        setToast(<span>{LINK_COPIED_COPY}</span>);
        operation.succeeded({ method: 'copy_link' });
        capture('debate_share_action', { ...properties, debate_id: debateId, space_id: spaceId, method: 'copy_link' });
        pushMarketingEvent('geo_share', { debate_id: debateId, space_id: spaceId, share_method: 'copy_link' });
      } catch {
        operation.failed('unavailable');
        setToast(<span>{COPY_LINK_FAILED_COPY}</span>);
      }
    },
    [getContext, debateId, setToast]
  );
}
