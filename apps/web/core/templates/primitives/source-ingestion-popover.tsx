'use client';

import * as Popover from '@radix-ui/react-popover';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { useParams, usePathname } from 'next/navigation';

import { ensureSpaceMembershipOutcome } from '~/core/access/request-space-membership';
import type { IngestionLink } from '~/core/chat/ingestion-link';
import { ROOT_SPACE } from '~/core/constants';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useUrlIngestionSubmit } from '~/core/hooks/use-url-ingestion-submit';
import { usePrivy } from '~/core/wallet/auth-hooks';

import { useTemplatePopoverContainer } from './entity-overflow-menu';
import { CloseIcon, PlusIcon } from './icons';

/**
 * The space the assistant writes an ingestion into: the route's space, as the chat widget reads it
 * (`/root` proxies to the root space).
 */
function useIngestionSpaceId(): string | null {
  const params = useParams();
  const pathname = usePathname() ?? '';
  const id = params?.['id'];
  if (typeof id === 'string') return id;
  return pathname === '/root' ? ROOT_SPACE : null;
}

/**
 * Joins a signed-in non-member to the space before their link goes to the ingestion, through the
 * same `ensureSpaceMembership` checks an Agree/Disagree vote runs: a DAO space gets a membership
 * request (shown as "Membership pending" wherever the space's Join is), a member or a space with no
 * membership flow goes straight through. The ingestion writes into the space, so unlike a vote it
 * doesn't go ahead when the request fails; resolves false then.
 */
function useJoinSpaceBeforeIngest(spaceId: string | null) {
  const queryClient = useQueryClient();
  const tx = useSmartAccountTransaction();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  return React.useCallback(async () => {
    const outcome = await ensureSpaceMembershipOutcome({
      spaceId,
      personalSpaceId: isRegistered ? personalSpaceId : null,
      tx,
      queryClient,
    });
    return outcome !== 'failed';
  }, [spaceId, personalSpaceId, isRegistered, tx, queryClient]);
}

/**
 * The `+` on a Sources / Sources & evidence section (GEO-3819). Pasting a link runs the same
 * ingestion as the space's Add data panel: the assistant opens, imports the page and stages it, and
 * `link` makes it a source of the page the `+` was on.
 *
 * Shown to everyone. Signed out, the press opens the sign-in dialog instead of the form, the way the
 * app's other signed-out write controls do. Signed in but not a member, submitting joins them to the
 * space first (see `useJoinSpaceBeforeIngest`).
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
  const popoverContainer = useTemplatePopoverContainer();
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
    <Popover.Root
      modal={false}
      open={open}
      onOpenChange={next => {
        if (next && !authenticated) {
          promptSignIn();
          return;
        }
        // Closing unmounts the form, which drops the typed link and any join error with it.
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={event => event.stopPropagation()}
          className={cx(
            'inline-grid size-7 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 transition-colors hover:text-text',
            open && 'text-text'
          )}
        >
          <PlusIcon className="size-4" />
        </button>
      </Popover.Trigger>

      <Popover.Portal container={popoverContainer}>
        <Popover.Content
          side="bottom"
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="pointer-events-auto z-[160] flex w-[340px] max-w-[calc(100vw-24px)] flex-col gap-3 rounded-xl border border-black/[0.08] bg-white p-4 shadow-[0_18px_48px_-8px_rgba(0,0,0,0.16),0_4px_12px_-2px_rgba(0,0,0,0.06)]"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-semibold text-text">{label}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={`Close ${label.toLowerCase()}`}
              className="inline-grid size-6 cursor-pointer place-items-center border-0 bg-transparent text-grey-04 hover:text-text"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>

          <SourceIngestionForm label={label} link={link} onClose={() => setOpen(false)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The link form inside the popover. Mounted only while the popover is open, so the join and the
 * ingestion's hooks (which need the app's query client) never run for a closed `+`.
 */
function SourceIngestionForm({ label, link, onClose }: { label: string; link?: IngestionLink; onClose: () => void }) {
  const joinSpace = useJoinSpaceBeforeIngest(useIngestionSpaceId());
  const [joinFailed, setJoinFailed] = React.useState(false);
  const beforeIngest = React.useCallback(async () => {
    setJoinFailed(false);
    const joined = await joinSpace();
    if (!joined) setJoinFailed(true);
    return joined;
  }, [joinSpace]);
  const { url, setUrl, submitting, canSubmit, handleSubmit } = useUrlIngestionSubmit({
    logTag: 'TemplateSourcesSection',
    onComplete: onClose,
    link,
    beforeIngest,
  });

  return (
    <form data-geo-analytics-label="Add source from URL" onSubmit={handleSubmit} className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1">
        <span className="text-[12.5px] font-medium text-grey-04">Link</span>
        <input
          type="text"
          autoFocus
          inputMode="url"
          value={url}
          onChange={event => setUrl(event.target.value)}
          placeholder="Paste news, podcast, tweet, blog URLs…"
          className="h-9 w-full rounded-lg border border-grey-02 bg-white px-3 text-[13.5px] text-text placeholder:text-grey-03 focus:border-text focus:outline-hidden"
        />
      </label>

      {joinFailed && (
        <p role="alert" className="m-0 text-[12.5px] text-red-01">
          Couldn&apos;t join this space, so the link wasn&apos;t added. Try again.
        </p>
      )}

      <div className="flex items-center justify-end gap-1.5 pt-1">
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
