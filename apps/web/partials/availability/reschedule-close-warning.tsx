'use client';

import { Content, Description, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import cx from 'classnames';

import { viewerDayAndTime } from '~/core/availability/peer-schedule';
import { debateActionAnalyticsAttributes, debateAnalyticsLabel } from '~/core/debates/matchmaking/hub-analytics';
import { HubPillButton, HubQuietButton } from '~/core/debates/matchmaking/hub-pill-button';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { Text } from '~/design-system/text';

function pill(action: string, intent: string) {
  return { analyticsLabel: debateAnalyticsLabel('peer-availability', action), analyticsIntent: intent };
}

/**
 * Closing the reschedule screen without a new time (GEO-3429, board 4b). The debate is still on, and
 * someone who opened this because they can't make it may not realise closing it tells nobody. So it
 * says so, and offers the way to tell them.
 *
 * A small card over the week rather than a full-screen sheet, so the week it came from is still
 * there behind it. Escape or a press outside goes back to the times, the choice that changes nothing.
 */
export function RescheduleCloseWarning({
  open,
  peerFirstName,
  startsAt,
  viewerTimezone,
  onCantMakeIt,
  onKeep,
  onBack,
}: {
  open: boolean;
  peerFirstName: string;
  /** The booked time, as geo-chat lists it. */
  startsAt: string;
  /** The zone the week behind it is drawn in, so the time reads as it does there. */
  viewerTimezone: string | undefined;
  onCantMakeIt: () => void;
  onKeep: () => void;
  onBack: () => void;
}) {
  const at = viewerDayAndTime(startsAt, viewerTimezone);
  return (
    <Root open={open} onOpenChange={next => !next && onBack()}>
      <Portal>
        <Overlay className={cx('fixed inset-0 bg-text/40', Z_LAYER_CLASS.scheduleDialogBackdrop)} />
        <Content
          className={cx(
            'fixed top-1/2 left-1/2 flex w-[24rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl bg-white p-5 shadow-card focus:outline-hidden',
            Z_LAYER_CLASS.scheduleDialog
          )}
        >
          <Title asChild>
            <Text as="h2" variant="smallTitle">
              Your debate is still on{at ? ` for ${at.day}, ${at.time}` : ''}
            </Text>
          </Title>
          <Description asChild>
            <Text as="p" variant="metadata" color="grey-04">
              {peerFirstName} will expect you then. If you can&rsquo;t make it, let them know so they aren&rsquo;t left
              waiting.
            </Text>
          </Description>
          <div className="mt-1 flex flex-col gap-2">
            <HubPillButton
              size="large"
              variant="primary"
              className="w-full"
              onClick={onCantMakeIt}
              {...pill('I cant make it', 'cant_make_it_from_reschedule')}
            >
              I can&rsquo;t make it
            </HubPillButton>
            <HubPillButton
              size="large"
              className="w-full"
              onClick={onKeep}
              {...pill('Keep the time', 'keep_scheduled_time')}
            >
              Keep {at?.time ?? 'the time'}
            </HubPillButton>
            <HubQuietButton
              onClick={onBack}
              {...debateActionAnalyticsAttributes('peer-availability', 'Back to times', 'back_to_peer_availability')}
            >
              Back to times
            </HubQuietButton>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
