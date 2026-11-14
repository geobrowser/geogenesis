'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { capture } from '~/core/analytics';
import { EditMomentsMenuItem } from '~/core/debates/browse/edit-moments-menu-item';
import { momentsEditorTabPath } from '~/core/debates/debate-routes';
import { useMomentBackfill } from '~/core/debates/moments-editor/hooks';
import { reelJob } from '~/core/debates/moments-editor/reel-status';
import { debateMomentsQueryKey } from '~/core/debates/moments-player/use-debate-moments';
import { useSetToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';

import { SquareButton } from '~/design-system/button';
import { Ellipsis } from '~/design-system/icons/ellipsis';
import { Menu } from '~/design-system/menu';

/** geo-chat speaks UUIDs; the popup works with Geo entity ids (hex). */
export function debateUuid(entityId: string) {
  return entityId.includes('-') ? entityId : ID.hexToUuid(entityId);
}

export const NEW_REEL_LIVE_COPY = 'New reel is live';
export const REEL_RENDER_FAILED_COPY = 'Reel render failed – open Edit moments';

/**
 * The watch popup's "…" (GEO-3742): "Edit moments", which opens the moments editor in a tab of its
 * own, so the ranking tab (the popup, its tab or filter, its scroll, an unpublished draft) is never
 * touched; the editor's Done closes that tab. The popup draws it only for media admins on desktop
 * (`WatchDebateDialog`), as the feed's host does for `DebateOverflowMenu`.
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
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      asChild
      align="end"
      className="max-w-[240px]"
      triggerRef={triggerRef}
      trigger={<SquareButton ref={triggerRef} icon={<Ellipsis />} aria-label="More debate options" />}
    >
      <EditMomentsMenuItem
        onClick={() => {
          setOpen(false);
          onOpen(entityId);
          // No opener, like the app's other new tabs; a noopener tab is still one a script opened, so Done
          // can close it (checked in Chromium).
          window.open(momentsEditorTabPath(spaceId, debateUuid(entityId)), '_blank', 'noopener');
        }}
      />
    </Menu>
  );
}

/**
 * Follows a reel the ranker may publish in the editor's tab (GEO-3742), from when they opened it.
 * The latest render request then is the baseline (whatever its state); once a later one is done,
 * the player's moments are read again (the popup's reel swaps in, now if it's open, else on the
 * next open). Any request done does that, previews too: the read only sees the latest request,
 * so a publish followed by a preview would otherwise never be noticed. A toast says how a reel
 * render went; previews get none. Only geo-chat's own `requested_at` values are compared, never
 * this browser's clock. The backfill read polls itself while a render runs, and is read again
 * whenever this tab comes back into view.
 */
export function ReelRenderWatcher({ entityId }: { entityId: string }) {
  const queryClient = useQueryClient();
  const setToast = useSetToast();
  const backfill = useMomentBackfill(debateUuid(entityId), true);
  const handled = React.useRef<string | null>(null);
  // The latest request when this started following: never this visit's.
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
    if (baseline.current === undefined) baseline.current = request?.requested_at ?? null;
    if (!request || !settled) return;
    if (request.requested_at === baseline.current || handled.current === request.requested_at) return;
    handled.current = request.requested_at;
    if (job.kind === 'done') void queryClient.invalidateQueries({ queryKey: debateMomentsQueryKey(entityId) });
    if (request.preview) return;
    setToast(<span>{job.kind === 'done' ? NEW_REEL_LIVE_COPY : REEL_RENDER_FAILED_COPY}</span>);
  }, [entityId, loaded, queryClient, request, setToast]);

  return null;
}

/** The analytics of opening the editor from the popup: the popup's own `element_clicked`. */
export function captureEditMoments(event: Record<string, unknown>) {
  capture('element_clicked', { ...event, element_action: 'edit_moments' });
}
