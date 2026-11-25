'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { useParams, usePathname } from 'next/navigation';

import type { IngestionLink } from '~/core/chat/ingestion-link';
import { pickIngestionSpace } from '~/core/chat/ingestion-space';
import { ROOT_SPACE } from '~/core/constants';
import { readAccountAddress, readRegisteredPersonalSpaceId } from '~/core/hooks/cached-write-identity';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import {
  type IngestionSpaceDecision,
  useStartUrlIngestion,
  useUrlIngestionSubmit,
} from '~/core/hooks/use-url-ingestion-submit';
import { useQueuedAction } from '~/core/state/pending-actions';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
import { usePrivy } from '~/core/wallet/auth-hooks';

import { ADD_FORM_ACTIONS_CLASS, AddFormSurface, useAddFormAutoFocus } from './entity-overflow-menu';

/**
 * The space of the page the `+` is on: the link's, which the section's adapter set. Not the route's
 * when the page is in the entity side panel, which opens over any route. Without one, the route's
 * space, as the chat widget reads it (`/root` proxies to the root space).
 */
function usePageSpaceId(link: IngestionLink | undefined): string | null {
  const params = useParams();
  const pathname = usePathname() ?? '';
  if (link?.targetSpaceId) return link.targetSpaceId;
  const id = params?.['id'];
  if (typeof id === 'string') return id;
  return pathname === '/root' ? ROOT_SPACE : null;
}

const LOG_TAG = 'TemplateSourcesSection';

/**
 * Picks the space a signed-in viewer's import writes into (see `pickIngestionSpace`): the page's
 * space for someone who can edit it, otherwise their own personal space, with a membership request
 * sent in the background as after a vote.
 *
 * With no personal space yet, it does what a vote does. While one is on its way (being created for
 * a new account, or still loading for a returning one) the import is queued and started once the
 * space exists; with none coming it is refused and the form asks them to finish setting up.
 */
function useIngestionSpace({
  pageSpaceId,
  link,
  onNeedsAccount,
}: {
  pageSpaceId: string | null;
  link?: IngestionLink;
  onNeedsAccount: () => void;
}) {
  const queryClient = useQueryClient();
  const tx = useSmartAccountTransaction();
  const { personalSpaceId, isRegistered, isLoading: isPersonalSpaceLoading } = usePersonalSpaceId();
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();
  const startIngestion = useStartUrlIngestion();

  const { queue: queueImport } = useQueuedAction({
    id: `source-ingestion:${link?.targetEntityId ?? ''}:${pageSpaceId ?? ''}`,
    component: 'ai_assistant',
    label: 'your source',
    survivesRedirect: false,
    // The queued URL is the intent. Replayed once the personal space exists. A press's own closure is
    // from before the space (and maybe the account address) was there, so both are read fresh, the
    // way vote replays do (`replay-viewer-response.ts`).
    run: async (url, { isCurrent }) => {
      if (!url) return;
      const freshPersonalSpaceId = readRegisteredPersonalSpaceId(queryClient, readAccountAddress(), {
        personalSpaceId,
        isRegistered,
      });
      if (!freshPersonalSpaceId) return;
      const writeSpace = await pickIngestionSpace({
        pageSpaceId,
        personalSpaceId: freshPersonalSpaceId,
        tx,
        queryClient,
      });
      if (!isCurrent()) return;
      await startIngestion({ url, logTag: LOG_TAG, link, writeSpace, isCurrent });
    },
  });

  return React.useCallback(
    async (url: string): Promise<IngestionSpaceDecision> => {
      if (isRegistered && personalSpaceId) {
        const writeSpace = await pickIngestionSpace({ pageSpaceId, personalSpaceId, tx, queryClient });
        return { kind: 'ingest', writeSpace };
      }
      if (isAccountSetupPending || isPersonalSpaceLoading) {
        queueImport(url);
        return { kind: 'queued' };
      }
      onNeedsAccount();
      return { kind: 'blocked' };
    },
    [
      isRegistered,
      personalSpaceId,
      isAccountSetupPending,
      isPersonalSpaceLoading,
      pageSpaceId,
      tx,
      queryClient,
      queueImport,
      onNeedsAccount,
    ]
  );
}

/**
 * The `+` on a Sources / Evidence section (GEO-3819). Pasting a link runs the same
 * ingestion as the space's Add data panel: the assistant opens, imports the page and stages it, and
 * `link` makes it a source of the page the `+` was on.
 *
 * Shown to everyone. Signed out, the press opens the sign-in dialog instead of the form, the way the
 * app's other signed-out write controls do. Signed in but not a member, the import goes into their
 * own personal space (see `useIngestionSpace`).
 */
export function SourceIngestionPopover({
  label,
  link,
  align = 'end',
}: {
  label: string;
  link?: IngestionLink;
  align?: 'start' | 'center' | 'end';
}) {
  const { authenticated } = usePrivy();
  const [open, setOpen] = React.useState(false);
  const promptSignIn = usePrivySignIn(undefined, {
    analytics: {
      component: 'template_sources_section',
      target_type: 'entity',
      target_id: link?.targetEntityId,
      auth_control: 'add_source',
      auth_intent: 'add_source',
      auth_continuation: 'repeat',
    },
  });

  return (
    <AddFormSurface
      label={label}
      open={open}
      align={align}
      onClose={() => setOpen(false)}
      onOpenChange={next => {
        if (next && !authenticated) {
          promptSignIn();
          return;
        }
        // Closing unmounts the form, which drops the typed link and any error with it.
        setOpen(next);
      }}
    >
      <SourceIngestionForm label={label} link={link} onClose={() => setOpen(false)} />
    </AddFormSurface>
  );
}

/**
 * The link form inside the popover. Mounted only while the popover is open, so the space pick and
 * the ingestion's hooks (which need the app's query client) never run for a closed `+`.
 */
function SourceIngestionForm({ label, link, onClose }: { label: string; link?: IngestionLink; onClose: () => void }) {
  const [needsAccount, setNeedsAccount] = React.useState(false);
  const autoFocus = useAddFormAutoFocus();
  const resolveSpace = useIngestionSpace({
    pageSpaceId: usePageSpaceId(link),
    link,
    onNeedsAccount: React.useCallback(() => setNeedsAccount(true), []),
  });
  const { url, setUrl, submitting, canSubmit, handleSubmit } = useUrlIngestionSubmit({
    logTag: LOG_TAG,
    onComplete: onClose,
    link,
    resolveSpace,
  });

  return (
    <form data-geo-analytics-label="Add source from URL" onSubmit={handleSubmit} className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1">
        <span className="text-[12.5px] font-medium text-grey-04">Link</span>
        <input
          type="text"
          autoFocus={autoFocus}
          inputMode="url"
          value={url}
          onChange={event => setUrl(event.target.value)}
          placeholder="Paste news, podcast, tweet, blog URLs…"
          className="h-9 w-full rounded-lg border border-grey-02 bg-white px-3 text-[13.5px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden md:text-[16px]"
        />
      </label>

      {needsAccount && (
        <p role="alert" className="m-0 text-[12.5px] text-red-01">
          Finish setting up your account to add sources.
        </p>
      )}

      <div className={ADD_FORM_ACTIONS_CLASS}>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 cursor-pointer items-center rounded-full border border-grey-02 bg-white px-3.5 text-[13px] font-medium text-text hover:border-text"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-8 cursor-pointer items-center rounded-full border border-text bg-text px-3.5 text-[13px] font-medium text-white disabled:opacity-40"
        >
          {submitting ? 'Adding…' : label}
        </button>
      </div>
    </form>
  );
}
