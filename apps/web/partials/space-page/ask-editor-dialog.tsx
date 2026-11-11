'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { lockedOutJoinLinkAtom } from '~/core/state/locked-out-join';

import { SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';

import { SpaceMembersManageDialog } from './space-members-manage-dialog';

/**
 * Mounted once at app level. Opens when a Join press finds the viewer can only get in through an
 * editor (`lockedOutJoinLinkAtom`). The instructions and the link are on screen, so it works on
 * phones and when the clipboard is unavailable.
 */
export function AskEditorDialog() {
  const [link, setLink] = useAtom(lockedOutJoinLinkAtom);

  return (
    <SpaceMembersManageDialog
      open={link !== null}
      onOpenChange={open => (open ? undefined : setLink(null))}
      header={<h1 className="text-smallTitle">Ask an editor to add you</h1>}
      content={link ? <AskEditorInstructions link={link} /> : null}
    />
  );
}

function AskEditorInstructions({ link }: { link: string }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body">
        You&apos;re on review only in this space, so it can&apos;t accept a join request from you. Send this link to one
        of its editors. When they open it, they can add you back.
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
