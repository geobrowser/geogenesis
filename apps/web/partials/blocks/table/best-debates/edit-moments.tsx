'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { capture } from '~/core/analytics';
import { momentsEditorTabPath } from '~/core/debates/debate-routes';
import { useIsMediaAdmin, useMomentBackfill } from '~/core/debates/moments-editor/hooks';
import { reelJob } from '~/core/debates/moments-editor/reel-status';
import { debateMomentsQueryKey } from '~/core/debates/moments-player/use-debate-moments';
import { useSetToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';

import { SquareButton } from '~/design-system/button';
import { Ellipsis } from '~/design-system/icons/ellipsis';
import { Menu } from '~/design-system/menu';

/** geo-chat speaks UUIDs; the popup works with Geo entity ids (hex). */
function debateUuid(entityId: string) {
  return entityId.includes('-') ? entityId : ID.hexToUuid(entityId);
}

const CLOCK_SLACK_MS = 2 * 60 * 1000;

export const NEW_REEL_LIVE_COPY = 'New reel is live';
export const REEL_RENDER_FAILED_COPY = 'Reel render failed – open Edit moments';

/**
 * The watch popup's "…" (GEO-3742): "Edit moments" for media admins, who can edit any debate's
 * reel. It opens the moments editor in a tab of its own, so the ranking tab (the popup, its tab
 * or filter, its scroll, an unpublished draft) is never touched; the editor's Done closes that tab.
 * Desktop only for now: the editor has no phone layout, so the whole button is hidden on a phone
 * (`md:` is max-width). Nothing at all for anyone else; the check fails closed.
 */
export function EditMomentsMenu({
  entityId,
  spaceId,
  onOpen,
}: {
  entityId: string;
  /** The debate's space, for the editor's path. */
  spaceId: string;
  /** The editor was opened for this debate: the popup watches for the new reel. */
  onOpen: (entityId: string) => void;
}) {
  const isAdmin = useIsMediaAdmin(debateUuid(entityId), true);
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  if (!isAdmin) return null;

  return (
    <span className="md:hidden">
      <Menu
        open={open}
        onOpenChange={setOpen}
        asChild
        align="end"
        className="max-w-[240px]"
        triggerRef={triggerRef}
        trigger={<SquareButton ref={triggerRef} icon={<Ellipsis />} aria-label="More debate options" />}
      >
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onOpen(entityId);
            window.open(momentsEditorTabPath(spaceId, debateUuid(entityId)), '_blank');
          }}
          className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 text-left text-button text-text hover:bg-bg"
        >
          Edit moments
        </button>
      </Menu>
    </span>
  );
}

/**
 * Follows a reel the ranker may publish in the editor's tab (GEO-3742), from when they opened it:
 * once a render that started after that settles, the player's moments are read again (the popup's
 * reel swaps in, now if it's open, else on the next open) and a toast says how it went. Previews
 * aren't reels. The backfill read polls itself while a render runs, and is read again whenever this
 * tab comes back into view.
 */
export function ReelRenderWatcher({ entityId, sinceMs }: { entityId: string; sinceMs: number }) {
  const queryClient = useQueryClient();
  const setToast = useSetToast();
  const backfill = useMomentBackfill(debateUuid(entityId), true);
  const handled = React.useRef<string | null>(null);
  // The request already settled when this started following: an older reel, never this visit's.
  const baseline = React.useRef<string | null | undefined>(undefined);
  const { refetch } = backfill;

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetch]);

  const request = backfill.data?.request;
  const loaded = backfill.data !== undefined;
  React.useEffect(() => {
    if (!loaded) return;
    const job = reelJob(request);
    const settled = job.kind === 'done' || job.kind === 'failed';
    if (baseline.current === undefined) baseline.current = settled ? (request?.requested_at ?? null) : null;
    if (!request || request.preview || !settled) return;
    if (request.requested_at === baseline.current || handled.current === request.requested_at) return;
    // geo-chat's clock, not this browser's: a little slack either way.
    const requestedAt = Date.parse(request.requested_at);
    if (!Number.isFinite(requestedAt) || requestedAt < sinceMs - CLOCK_SLACK_MS) return;
    handled.current = request.requested_at;
    if (job.kind === 'done') void queryClient.invalidateQueries({ queryKey: debateMomentsQueryKey(entityId) });
    setToast(<span>{job.kind === 'done' ? NEW_REEL_LIVE_COPY : REEL_RENDER_FAILED_COPY}</span>);
  }, [entityId, loaded, queryClient, request, setToast, sinceMs]);

  return null;
}

/** The analytics of opening the editor from the popup: the popup's own `element_clicked`. */
export function captureEditMoments(event: Record<string, unknown>) {
  capture('element_clicked', { ...event, element_action: 'edit_moments' });
}
