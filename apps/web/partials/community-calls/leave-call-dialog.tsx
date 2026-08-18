'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import { Button } from '~/design-system/button';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditor: boolean;
  /** True once this user has been confirmed (debounced) as the only editor left in the room. */
  isLastEditor: boolean;
  isRecording: boolean;
  canControlRecording: boolean;
  endCallBusy: boolean;
  onLeave: () => void;
  onEndCallForEveryone: () => void;
  onStopRecordingAndLeave: () => void;
};

/**
 * Leave-call confirmation. Editors get an "End call for everyone" option
 * (curator-backend force-disconnects the room), and either flow offers to stop
 * an in-progress recording first so it doesn't keep running against an empty
 * room. If this user is the last editor in the room, "End call for everyone"
 * is promoted to the primary action with a warning — non-blocking, "Leave
 * without ending" stays available.
 */
export function LeaveCallDialog({
  open,
  onOpenChange,
  isEditor,
  isLastEditor,
  isRecording,
  canControlRecording,
  endCallBusy,
  onLeave,
  onEndCallForEveryone,
  onStopRecordingAndLeave,
}: Props) {
  const showStopRecording = isRecording && canControlRecording;
  const endCallLabel = endCallBusy
    ? 'Ending call…'
    : isRecording
      ? 'Stop recording & end call for everyone'
      : 'End call for everyone';

  const description = isLastEditor
    ? "You're the last editor in this call. If you leave without ending it, other participants may continue to publish content."
    : showStopRecording
      ? 'A recording is still in progress. Choose how you want to leave.'
      : 'Choose how you want to leave the call.';

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />
        <Content className="fixed inset-0 z-101 flex items-center justify-center focus:outline-hidden">
          <div className="mx-4 flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6">
            <Title className="text-smallTitle">Leave call</Title>
            <p className="text-metadata text-grey-04">{description}</p>
            <div className="flex flex-col gap-2">
              {isLastEditor ? (
                <>
                  <Button variant="error" disabled={endCallBusy} onClick={onEndCallForEveryone}>
                    {endCallLabel}
                  </Button>
                  {showStopRecording && (
                    <Button variant="secondary" disabled={endCallBusy} onClick={onStopRecordingAndLeave}>
                      Stop recording & leave without ending
                    </Button>
                  )}
                  <Button variant="secondary" disabled={endCallBusy} onClick={onLeave}>
                    Leave without ending
                  </Button>
                </>
              ) : (
                <>
                  {showStopRecording && (
                    <Button variant="primary" disabled={endCallBusy} onClick={onStopRecordingAndLeave}>
                      Stop recording & leave
                    </Button>
                  )}
                  <Button
                    variant={showStopRecording ? 'secondary' : 'primary'}
                    disabled={endCallBusy}
                    onClick={onLeave}
                  >
                    Leave
                  </Button>
                  {isEditor && (
                    <Button variant="error" disabled={endCallBusy} onClick={onEndCallForEveryone}>
                      {endCallLabel}
                    </Button>
                  )}
                </>
              )}
              <Button variant="secondary" disabled={endCallBusy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
