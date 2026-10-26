import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type CallRecordingState, GeoChatRequestError } from '~/core/debates/api';
import type { LobbyPageView } from '~/core/debates/lobbies/lobby-view';

const mocks = vi.hoisted(() => ({
  flag: true,
  connected: true,
  mutate: vi.fn(),
  control: { isPending: false, isError: false, error: null as unknown, variables: undefined as string | undefined },
}));

vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.flag }));
vi.mock('~/core/debates/lobbies/lobby-voice', () => ({
  useLobbyVoiceStates: () => ({ connected: mocks.connected }),
}));
vi.mock('./hooks', () => ({
  useCallRecordingControl: () => ({ ...mocks.control, mutate: mocks.mutate }),
}));

const { CallRecordingBar, EndCallPublishChoice, StageRecordingPrompt, startErrorMessage, CALL_RECORDING_COPY } =
  await import('./call-recording-room');

afterEach(() => {
  cleanup();
  mocks.flag = true;
  mocks.connected = true;
  mocks.mutate.mockReset();
  mocks.control = { isPending: false, isError: false, error: null, variables: undefined };
});

const OFF: CallRecordingState = {
  status: 'off',
  started_at: null,
  started_by: null,
  stopped_at: null,
  end_reason: null,
  can_start: true,
  published: false,
  duration_seconds: null,
};
const RECORDING: CallRecordingState = {
  ...OFF,
  status: 'recording',
  started_at: '2026-10-27T15:02:10Z',
  can_start: false,
};

function call(recording: CallRecordingState | null, { manage = false, guest = false } = {}): LobbyPageView {
  return {
    lobby_id: 'call1',
    name: 'Weekly call',
    purpose: 'call',
    call: { space_id: 'space1', space_name: 'Crypto', started_by: null, recording },
    members: [],
    viewer: guest
      ? { kind: 'guest', role: null, creator: false, hosting: false }
      : { kind: 'member', role: 'host', hosting: true, can_manage_recording: manage },
  } as unknown as LobbyPageView;
}

describe('CallRecordingBar', () => {
  it('draws nothing with the flag off, even while recording', () => {
    mocks.flag = false;
    const { container } = render(<CallRecordingBar lobby={call(RECORDING, { manage: true })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows everyone the REC banner, guests included, with no control', () => {
    render(<CallRecordingBar lobby={call(RECORDING, { guest: true })} />);
    expect(screen.getByText(CALL_RECORDING_COPY.rec)).toBeInTheDocument();
    expect(screen.getByText(CALL_RECORDING_COPY.banner)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers Start to an editor only, not to a host who cannot manage recording', () => {
    const { rerender, container } = render(<CallRecordingBar lobby={call(OFF)} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CallRecordingBar lobby={call(OFF, { manage: true })} />);
    fireEvent.click(screen.getByRole('button', { name: CALL_RECORDING_COPY.start }));
    expect(mocks.mutate).toHaveBeenCalledWith('start', expect.anything());
  });

  it('shows the banner from the click, before the view comes back', () => {
    mocks.control = { ...mocks.control, isPending: true, variables: 'start' };
    render(<CallRecordingBar lobby={call(OFF, { manage: true })} />);
    expect(screen.getByText(CALL_RECORDING_COPY.banner)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CALL_RECORDING_COPY.start })).toBeNull();
  });

  it('asks before stopping, since a call has one recording', () => {
    render(<CallRecordingBar lobby={call(RECORDING, { manage: true })} />);
    fireEvent.click(screen.getByRole('button', { name: CALL_RECORDING_COPY.stop }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(CALL_RECORDING_COPY.stopConfirm)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: CALL_RECORDING_COPY.stop }));
    expect(mocks.mutate).toHaveBeenCalledWith('stop', expect.anything());
  });

  it('is gone once stopped', () => {
    const { container } = render(
      <CallRecordingBar lobby={call({ ...RECORDING, status: 'processing', can_start: false }, { manage: true })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Start again after LiveKit refused one', () => {
    render(
      <CallRecordingBar
        lobby={call({ ...OFF, status: 'failed', end_reason: 'start_failed', can_start: true }, { manage: true })}
      />
    );
    expect(screen.getByRole('button', { name: CALL_RECORDING_COPY.start })).toBeInTheDocument();
    expect(screen.getByText(CALL_RECORDING_COPY.refused)).toBeInTheDocument();
  });
});

describe('startErrorMessage', () => {
  it('names the refusals the contract lists', () => {
    expect(startErrorMessage(new GeoChatRequestError('x', 'call_recording_not_in_call', 409))).toBe(
      CALL_RECORDING_COPY.notInCall
    );
    expect(startErrorMessage(new GeoChatRequestError('x', 'call_recording_already_used', 409))).toBe(
      CALL_RECORDING_COPY.alreadyUsed
    );
    expect(startErrorMessage(new GeoChatRequestError('x', 'rate_limited', 429))).toBe(CALL_RECORDING_COPY.rateLimited);
  });
});

describe('StageRecordingPrompt', () => {
  it('waits for voice, so the pre-join comes first', () => {
    mocks.connected = false;
    render(<StageRecordingPrompt notice="prompt" onAcknowledge={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.queryByTestId('call-recording-prompt')).toBeNull();
  });

  it('confirms or leaves', () => {
    const onAcknowledge = vi.fn();
    const onLeave = vi.fn();
    render(<StageRecordingPrompt notice="prompt" onAcknowledge={onAcknowledge} onLeave={onLeave} />);
    fireEvent.click(screen.getByRole('button', { name: CALL_RECORDING_COPY.promptLeave }));
    expect(onLeave).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: CALL_RECORDING_COPY.promptOk }));
    expect(onAcknowledge).toHaveBeenCalled();
  });

  it('tells someone already on stage without stopping them', () => {
    render(<StageRecordingPrompt notice="toast" onAcknowledge={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.queryByTestId('call-recording-prompt')).toBeNull();
    expect(screen.getByText(CALL_RECORDING_COPY.toast)).toBeInTheDocument();
  });
});

describe('EndCallPublishChoice', () => {
  it('is offered to an editor with a recording, and to nobody else', () => {
    const onChange = vi.fn();
    const { rerender, container } = render(
      <EndCallPublishChoice lobby={call(RECORDING)} checked={false} onChange={onChange} />
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<EndCallPublishChoice lobby={call(OFF, { manage: true })} checked={false} onChange={onChange} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<EndCallPublishChoice lobby={call(RECORDING, { manage: true })} checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Publish the recording/ }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
