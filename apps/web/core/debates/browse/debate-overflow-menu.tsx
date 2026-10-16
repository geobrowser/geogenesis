'use client';

import { Content, Description, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import cx from 'classnames';

import { DEBATE_HIDE_REASON_MAX_CHARS, type Debate, GeoChatRequestError } from '~/core/debates/api';
import { canRemoveDebate, debateVisibilityErrorMessage } from '~/core/debates/debate-removal';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { useRemoveDebate } from '~/core/debates/use-debate-removal';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useToast } from '~/core/hooks/use-toast';

import { Button } from '~/design-system/button';
import { Ellipsis } from '~/design-system/icons/ellipsis';
import { Menu } from '~/design-system/menu';
import { Text } from '~/design-system/text';

import { CIRCLE_ACTION_CLASS, PILL_ACTION_CLASS } from './pill-action';

/**
 * Whether the viewer may remove this debate, by geo-chat's rule: a participant, or an editor of the
 * debate's space. The space is the claim's (`debate.claim.space_id`), which is the one geo-chat
 * checks editorship against — not necessarily the space the feed is being browsed in.
 */
export function useCanRemoveDebate(debate: Debate): boolean {
  const { isEditor } = useAccessControl(debate.claim.space_id);
  const viewerUserId = useCurrentGeoChatUserId();
  const { personalSpaceId } = usePersonalSpaceId();
  return canRemoveDebate({
    debate,
    viewerUserId,
    viewerPersonalSpaceId: personalSpaceId,
    isSpaceEditor: isEditor,
  });
}

/**
 * The "…" beside a debate's actions. Holds only what a few viewers can do — removing the debate
 * (GEO-2785) — so it is not drawn at all for everyone else, and the bar reads as it always has.
 */
export function DebateOverflowMenu({ debate, variant }: { debate: Debate; variant: 'circle' | 'pill' }) {
  const canRemove = useCanRemoveDebate(debate);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  if (!canRemove) return null;

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      aria-label="More debate options"
      data-geo-analytics-label="Debate options"
      data-geo-analytics-intent="debate_action"
      className={variant === 'circle' ? CIRCLE_ACTION_CLASS : cx(PILL_ACTION_CLASS, 'w-7 justify-center px-0')}
    >
      <Ellipsis />
    </button>
  );

  return (
    <>
      <Menu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        asChild
        align="end"
        className="max-w-[240px]"
        triggerRef={triggerRef}
        trigger={trigger}
      >
        <button
          type="button"
          data-geo-analytics-label="Remove debate"
          data-geo-analytics-intent="debate_action"
          onClick={() => {
            setMenuOpen(false);
            setConfirmOpen(true);
          }}
          className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 text-left text-button text-red-01 hover:bg-bg"
        >
          Remove debate
        </button>
      </Menu>
      <RemoveDebateDialog
        debateId={debate.id}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        openerRef={triggerRef}
      />
    </>
  );
}

export function RemoveDebateDialog({
  debateId,
  open,
  onOpenChange,
  openerRef,
}: {
  debateId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openerRef?: React.RefObject<HTMLElement | null>;
}) {
  const [reason, setReason] = React.useState('');
  const remove = useRemoveDebate(debateId);
  const [, setToast] = useToast();

  // A fresh dialog each time it opens: a half-typed reason or an old refusal is not carried over.
  React.useEffect(() => {
    if (open) {
      setReason('');
      remove.reset();
    }
    // `remove.reset` is stable per mutation observer; keyed on `open` alone on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const errorMessage =
    remove.error != null
      ? debateVisibilityErrorMessage(remove.error instanceof GeoChatRequestError ? remove.error.code : null, 'remove')
      : null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (remove.isPending) return;
    remove.mutate(reason.trim() || null, {
      onSuccess: () => {
        onOpenChange(false);
        setToast(<span>Debate removed.</span>);
      },
    });
  };

  return (
    <Root open={open} onOpenChange={next => (remove.isPending ? undefined : onOpenChange(next))}>
      <Portal>
        <Overlay className="fixed inset-0 z-[1000] bg-text/20" />
        <Content
          onCloseAutoFocus={event => {
            if (!openerRef) return;
            event.preventDefault();
            openerRef.current?.focus();
          }}
          className="fixed top-1/2 left-1/2 z-[1001] w-[400px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 focus:outline-hidden"
        >
          <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl bg-white p-5 shadow-card">
            <Title asChild>
              <Text as="h2" variant="mediumTitle">
                Remove this debate?
              </Text>
            </Title>
            <Description asChild>
              <Text as="p" variant="body" color="grey-04">
                It will no longer play or appear in feeds and listings, and its page will say it has been removed. It
                can be restored later.
              </Text>
            </Description>
            <label className="flex flex-col gap-1">
              <Text as="span" variant="metadataMedium">
                Reason (optional)
              </Text>
              <textarea
                value={reason}
                onChange={event => setReason(event.target.value)}
                maxLength={DEBATE_HIDE_REASON_MAX_CHARS}
                rows={3}
                className="resize-none rounded-md border border-grey-02 px-3 py-2 text-body focus:border-text focus:outline-hidden"
              />
            </label>
            {errorMessage && (
              <div role="alert">
                <Text as="p" variant="metadata" color="red-01">
                  {errorMessage}
                </Text>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={remove.isPending} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="error" disabled={remove.isPending}>
                {remove.isPending ? 'Removing…' : 'Remove debate'}
              </Button>
            </div>
          </form>
        </Content>
      </Portal>
    </Root>
  );
}
