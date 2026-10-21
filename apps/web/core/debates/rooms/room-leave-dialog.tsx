'use client';

import { Content, Description, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';

import { ROOM_LEAVE_CONFIRM } from './room-copy';
import type { DebateRoomPresenceState } from './room-presence';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: DebateRoomPresenceState;
  opponentName: string;
  onLeave: () => void;
  /** The dialog has no Trigger, so Radix would hand focus back to the body on close. */
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * Leave, confirmed (GEO-3433). Above the room's own `z-[150]` layer, and the card is the `Content`
 * inside a full-screen `Overlay`, so a press beside it dismisses — which, like Escape, means Stay.
 */
export function RoomLeaveDialog({ open, onOpenChange, state, opponentName, onLeave, onCloseAutoFocus }: Props) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-[1010] flex items-center justify-center bg-text/45 p-5">
          <Content
            onCloseAutoFocus={onCloseAutoFocus}
            className="grid w-[min(360px,100%)] gap-4 rounded-lg bg-white p-5 text-text shadow-card focus:outline-hidden"
          >
            <div className="grid gap-1 text-center">
              <Title className="text-metadata font-semibold">{ROOM_LEAVE_CONFIRM.title}</Title>
              <Description className="text-[14px] leading-5 text-grey-04">
                {ROOM_LEAVE_CONFIRM.body(state, opponentName)}
              </Description>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* First, so it takes the opening focus: Enter on an accidental Leave keeps you in. */}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                data-geo-analytics-label="Debate room leave confirm stay"
                className={DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME}
              >
                {ROOM_LEAVE_CONFIRM.stay}
              </button>
              <button
                type="button"
                onClick={onLeave}
                data-geo-analytics-label="Debate room leave confirm leave"
                className={DIALOG_ACTION_BUTTON_CLASS_NAME}
              >
                {ROOM_LEAVE_CONFIRM.leave}
              </button>
            </div>
          </Content>
        </Overlay>
      </Portal>
    </Root>
  );
}
