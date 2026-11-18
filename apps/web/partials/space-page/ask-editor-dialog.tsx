'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { type LockedOutJoin, lockedOutJoinAtom } from '~/core/state/locked-out-join';

import { SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';

import { SpaceMembersManageDialog } from './space-members-manage-dialog';

/**
 * Mounted once at app level. Opens when a Join press finds the viewer can only get in through an
 * editor (`lockedOutJoinAtom`). The instructions and the link are on screen, so it works on
 * phones and when the clipboard is unavailable.
 */
export function AskEditorDialog() {
  const [lockedOut, setLockedOut] = useAtom(lockedOutJoinAtom);

  return (
    <SpaceMembersManageDialog
      open={lockedOut !== null}
      onOpenChange={open => (open ? undefined : setLockedOut(null))}
      header={<h1 className="text-smallTitle">Ask an editor to add you</h1>}
      content={lockedOut ? <AskEditorInstructions {...lockedOut} /> : null}
    />
  );
}

function AskEditorInstructions({ link, spaceName }: LockedOutJoin) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body">
        You&apos;re on review only in {spaceName ?? 'this space'}, so it can&apos;t accept a join request from you. Send
        this link to one of its editors. When they open it, they can add you back.
      </p>
      <div className="flex items-center gap-2">
        <Input readOnly value={link} aria-label="Link for an editor" onFocus={event => event.currentTarget.select()} />
        <SmallButton
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch (error) {
              // The link is on screen to copy by hand.
              console.error('Failed to copy add-back link', error);
            }
          }}
        >
          {copied ? 'Copied!' : 'Copy link'}
        </SmallButton>
      </div>
    </div>
  );
}
