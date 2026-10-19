import type { ActionContext } from '~/core/action-context';
import { capture } from '~/core/analytics';
import { analyticsRuntime, isAnalyticsEnabled, readAnalyticsContext } from '~/core/analytics-context';
import { snapshotAnalyticsRevision } from '~/core/analytics-operations';

import { type ShareLink, shareUuid } from './share-link';

type ShareActionContext = ActionContext & { space_id?: string };

/** Uses already-loaded analytics identity traits; no wallet/profile requests on the share path. */
function sharer(participants?: readonly string[]) {
  try {
    const context = readAnalyticsContext();
    if (context.is_identified === false) return { sharer_role: 'anonymous' };
    const identity = isAnalyticsEnabled ? analyticsRuntime()?.getIdentity?.() : undefined;
    const profile = shareUuid(identity?.personal_space_id);
    const participantIds = participants?.map(shareUuid);
    let role: 'debater' | 'other' | 'unknown' = 'unknown';
    if (profile && participantIds?.includes(profile)) role = 'debater';
    else if (profile && participantIds?.length && participantIds.every(id => id !== null)) role = 'other';
    return {
      ...(profile ? { sharer_profile_space_id: profile } : {}),
      sharer_role: role,
    };
  } catch {
    return { sharer_role: 'unknown' };
  }
}

/** Snapshot before the handoff so navigation or account switching cannot change its actor/context. */
export function observeShareLinkHandoff(
  link: ShareLink,
  context: ShareActionContext,
  participants?: readonly string[]
) {
  const isCurrent = snapshotAnalyticsRevision();
  const actor = sharer(participants);
  let emitted = false;
  return (handoffKind: 'copied' | 'composer_requested') => {
    if (!link.attribution || emitted || !isCurrent()) return;
    emitted = true;
    try {
      capture('share_link_handoff', {
        ...context,
        ...link.attribution,
        ...actor,
        operation_id: link.attribution.share_id,
        handoff_kind: handoffKind,
        action_context_version: 'v1',
      });
    } catch {
      // A collector failure must not change the result of a product action.
    }
  };
}

export async function copyShareLink(link: ShareLink, context: ShareActionContext, participants?: readonly string[]) {
  const handoff = observeShareLinkHandoff(link, context, participants);
  await navigator.clipboard.writeText(link.url);
  handoff('copied');
}
