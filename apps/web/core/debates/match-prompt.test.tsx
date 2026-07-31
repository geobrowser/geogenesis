import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { type ReactNode, StrictMode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureFlagId } from '~/core/state/feature-flags';

import type { Debate, DebateActivity, DebateMatch } from './api';
import { createDebateMatchTabOwnershipCoordinator } from './debate-match-tab-ownership';
import { defaultDebateFormatId } from './formats';
import { DebateMatchPrompt } from './match-prompt';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  currentUserId: vi.fn(),
  acceptMutate: vi.fn(),
  acceptError: null as Error | null,
  declineMutate: vi.fn(),
  markReadyMutate: vi.fn(),
  markReadyPending: false,
  abortMutate: vi.fn(),
  beginMediaSession: vi.fn(),
  promoteMediaSession: vi.fn(),
  releaseMediaSession: vi.fn(),
  ensurePreview: vi.fn(),
  featureFlags: {
    debateFormatSelector: false,
  } as Partial<Record<FeatureFlagId, boolean>>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: FeatureFlagId) => mocks.featureFlags[id] ?? false,
}));

vi.mock('~/core/community-calls/use-is-mobile-call-layout', () => ({
  useIsMobileCallLayout: () => false,
}));

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();

  return {
    ...actual,
    getCurrentGeoChatUserId: () => mocks.currentUserId(),
  };
});

vi.mock('./hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('./hooks')>();

  return {
    ...actual,
    useAcceptDebateMatch: () => ({ mutate: mocks.acceptMutate, isPending: false, error: mocks.acceptError }),
    useDeclineDebateMatch: () => ({ mutate: mocks.declineMutate, isPending: false, error: null }),
    useMarkDebateReady: () => ({ mutate: mocks.markReadyMutate, isPending: mocks.markReadyPending, error: null }),
    useAbortDebate: () => ({ mutate: mocks.abortMutate, isPending: false, error: null }),
  };
});

vi.mock('./media-session', () => ({
  DebateMediaSessionBoundary: ({ children }: { children: ReactNode }) => children,
  debateMatchMediaSessionKey: (matchId: string) => `match:${matchId}`,
  debateMediaSessionKey: (debateId: string) => `debate:${debateId}`,
  systemDefaultAudioOutput: {
    deviceId: 'default',
    groupId: 'default',
    kind: 'audiooutput',
    label: 'System default',
  },
  useDebateMediaSession: () => ({
    activeSessionKey: null,
    previewState: 'ready',
    previewBusy: false,
    previewError: null,
    previewStream: null,
    audioInputDevices: [],
    audioOutputDevices: [],
    videoInputDevices: [],
    selectedAudioInputId: '',
    selectedAudioOutputId: 'default',
    selectedVideoInputId: '',
    audioOutputSupported: false,
    audioOutputError: null,
    beginSession: mocks.beginMediaSession,
    promoteSession: mocks.promoteMediaSession,
    releaseSession: mocks.releaseMediaSession,
    ensurePreview: mocks.ensurePreview,
    changeAudioInput: vi.fn(),
    changeAudioOutput: vi.fn(),
    changeVideoInput: vi.fn(),
  }),
}));

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();

  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(private readonly name: string) {
    const channels = FakeBroadcastChannel.channels.get(name) ?? new Set();
    channels.add(this);
    FakeBroadcastChannel.channels.set(name, channels);
  }

  postMessage(data: unknown) {
    for (const channel of FakeBroadcastChannel.channels.get(this.name) ?? []) {
      if (channel !== this) queueMicrotask(() => channel.onmessage?.(new MessageEvent('message', { data })));
    }
  }

  close() {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  sessionStorage.clear();
  mocks.push.mockReset();
  mocks.currentUserId.mockReturnValue('user-for');
  mocks.acceptMutate.mockReset();
  mocks.acceptError = null;
  mocks.declineMutate.mockReset();
  mocks.markReadyMutate.mockReset();
  mocks.markReadyPending = false;
  mocks.abortMutate.mockReset();
  mocks.beginMediaSession.mockReset();
  mocks.promoteMediaSession.mockReset();
  mocks.releaseMediaSession.mockReset();
  mocks.ensurePreview.mockReset().mockResolvedValue(previewTracks());
  mocks.featureFlags = {
    debateFormatSelector: false,
  };
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  FakeBroadcastChannel.channels.clear();
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  FakeBroadcastChannel.channels.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DebateMatchPrompt', () => {
  it('opens a match modal and disables accept immediately after submitting the default format', async () => {
    mocks.acceptMutate.mockImplementation((_variables, options) => {
      options.onSuccess({ match: { ...match(), debate_id: 'debate-1' }, debate: debate() });
    });

    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    expect(screen.getByRole('dialog', { name: 'The protocol should ship debates' })).toBeInTheDocument();
    expect(screen.getByText('Debate request')).toBeInTheDocument();
    expect(screen.getByText('Bri makes an argument')).toBeInTheDocument();

    expect(screen.queryByLabelText('Debate format')).not.toBeInTheDocument();

    const acceptButton = screen.getByRole('button', { name: 'Accept' });
    expect(acceptButton).toBeEnabled();

    fireEvent.click(acceptButton);

    expect(acceptButton).toBeDisabled();
    await waitFor(() =>
      expect(mocks.acceptMutate).toHaveBeenCalledWith(
        { matchId: 'match-1', formatId: defaultDebateFormatId },
        expect.any(Object)
      )
    );
    expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/debate-1');
  });

  it('keeps ownership coordination usable through Strict Mode effect replay', async () => {
    render(
      <StrictMode>
        <DebateMatchPrompt spaceId="space-1" matches={[match()]} />
      </StrictMode>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(mocks.acceptMutate).toHaveBeenCalledOnce());
  });

  it('serializes repeated actions while ownership acquisition is in flight', async () => {
    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);
    const acceptButton = screen.getByRole('button', { name: 'Accept' });

    fireEvent.click(acceptButton);
    fireEvent.click(acceptButton);

    await waitFor(() => expect(mocks.acceptMutate).toHaveBeenCalledOnce());
    expect(mocks.declineMutate).not.toHaveBeenCalled();
  });

  it('lets the first participant choose a format when the feature flag is enabled', async () => {
    mocks.featureFlags.debateFormatSelector = true;

    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    fireEvent.change(screen.getByLabelText('Debate format'), { target: { value: 'extended-standard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() =>
      expect(mocks.acceptMutate).toHaveBeenCalledWith(
        { matchId: 'match-1', formatId: 'extended-standard' },
        expect.any(Object)
      )
    );
  });

  it('re-enables accept when submitting the match fails', async () => {
    let failRequest = () => {};
    mocks.acceptMutate.mockImplementation((_variables, options) => {
      failRequest = () => options.onError();
    });

    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    const acceptButton = screen.getByRole('button', { name: 'Accept' });
    fireEvent.click(acceptButton);

    expect(acceptButton).toBeDisabled();

    await waitFor(() => expect(mocks.acceptMutate).toHaveBeenCalledOnce());
    act(failRequest);

    await waitFor(() => expect(acceptButton).toBeEnabled());
    expect(sessionStorage.getItem('geo:debate-match-owner:user-for')).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.ensurePreview).not.toHaveBeenCalled();
  });

  it.each([
    ['rejects', () => Promise.reject(new Error('Offline'))],
    ['returns no activity', () => Promise.resolve(null)],
  ])('keeps ambiguous ownership retryable when reconciliation %s', async (_label, reconcileActivity) => {
    let failRequest = () => {};
    mocks.acceptMutate.mockImplementation((_variables, options) => {
      failRequest = () => options.onError(new Error('Response lost'));
    });

    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} reconcileActivity={reconcileActivity} />);
    const acceptButton = screen.getByRole('button', { name: 'Accept' });
    fireEvent.click(acceptButton);
    await waitFor(() => expect(mocks.acceptMutate).toHaveBeenCalledOnce());

    act(failRequest);

    await waitFor(() => expect(acceptButton).toBeEnabled());
    expect(JSON.parse(sessionStorage.getItem('geo:debate-match-owner:user-for')!)).toMatchObject({ state: 'pending' });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.ensurePreview).not.toHaveBeenCalled();
  });

  it('releases ownership when reconciliation confirms the match was not accepted', async () => {
    let failRequest = () => {};
    mocks.acceptMutate.mockImplementation((_variables, options) => {
      failRequest = () => options.onError(new Error('Rejected'));
    });
    const reconcileActivity = vi.fn().mockResolvedValue({
      online: true,
      available_to_debate: true,
      cooldown_until: null,
      match: match(),
      debate: null,
      rematch: null,
      challenge: null,
    } satisfies DebateActivity);

    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} reconcileActivity={reconcileActivity} />);
    const acceptButton = screen.getByRole('button', { name: 'Accept' });
    fireEvent.click(acceptButton);
    await waitFor(() => expect(mocks.acceptMutate).toHaveBeenCalledOnce());

    act(failRequest);

    await waitFor(() => expect(acceptButton).toBeEnabled());
    expect(sessionStorage.getItem('geo:debate-match-owner:user-for')).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.ensurePreview).not.toHaveBeenCalled();
  });

  it('makes an ambiguous acceptance retryable when reconciliation never settles', async () => {
    vi.useFakeTimers();
    let failRequest = () => {};
    mocks.acceptMutate.mockImplementation((_variables, options) => {
      failRequest = () => options.onError(new Error('Response lost'));
    });

    render(
      <DebateMatchPrompt spaceId="space-1" matches={[match()]} reconcileActivity={() => new Promise(() => undefined)} />
    );
    const acceptButton = screen.getByRole('button', { name: 'Accept' });
    await act(async () => fireEvent.click(acceptButton));
    expect(mocks.acceptMutate).toHaveBeenCalledOnce();
    act(failRequest);

    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(acceptButton).toBeEnabled();
    expect(JSON.parse(sessionStorage.getItem('geo:debate-match-owner:user-for')!)).toMatchObject({ state: 'pending' });
  });

  it('keeps ownership when a failed response reconciles to canonical acceptance', async () => {
    let failRequest = () => {};
    mocks.acceptMutate.mockImplementation((_variables, options) => {
      failRequest = () => options.onError(new Error('Response lost'));
    });
    const acceptedMatch = match();
    acceptedMatch.participants[0]!.accepted = true;
    const reconcileActivity = vi.fn().mockResolvedValue({
      online: true,
      available_to_debate: true,
      cooldown_until: null,
      match: acceptedMatch,
      debate: null,
      rematch: null,
      challenge: null,
    } satisfies DebateActivity);

    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} reconcileActivity={reconcileActivity} />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(mocks.acceptMutate).toHaveBeenCalledOnce());

    act(failRequest);

    expect(await screen.findByRole('dialog', { name: 'Debate readiness' })).toBeInTheDocument();
    expect(reconcileActivity).toHaveBeenCalledOnce();
    expect(JSON.parse(sessionStorage.getItem('geo:debate-match-owner:user-for')!)).toMatchObject({
      state: 'confirmed',
    });
    expect(screen.queryByText('Response lost')).not.toBeInTheDocument();
  });

  it('keeps ownership when a failed response reconciles directly to an active debate', async () => {
    let failRequest = () => {};
    mocks.acceptMutate.mockImplementation((_variables, options) => {
      failRequest = () => options.onError(new Error('Response lost'));
    });
    const reconcileActivity = vi.fn().mockResolvedValue({
      online: true,
      available_to_debate: true,
      cooldown_until: null,
      match: null,
      debate: debate(),
      rematch: null,
      challenge: null,
    } satisfies DebateActivity);

    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} reconcileActivity={reconcileActivity} />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(mocks.acceptMutate).toHaveBeenCalledOnce());

    act(failRequest);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/debate-1'));
    expect(JSON.parse(sessionStorage.getItem('geo:debate-match-owner:user-for')!)).toMatchObject({
      state: 'confirmed',
    });
    expect(screen.queryByText('Response lost')).not.toBeInTheDocument();
  });

  it.each(['complete', 'cancelled'] as const)(
    'rejects a failed response that reconciles to a %s debate',
    async status => {
      let failRequest = () => {};
      mocks.acceptMutate.mockImplementation((_variables, options) => {
        failRequest = () => options.onError(new Error('Response lost'));
      });
      const terminalDebate = { ...debate(), status };
      const reconcileActivity = vi.fn().mockResolvedValue({
        online: true,
        available_to_debate: true,
        cooldown_until: null,
        match: null,
        debate: terminalDebate,
        rematch: null,
        challenge: null,
      } satisfies DebateActivity);

      render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} reconcileActivity={reconcileActivity} />);
      const acceptButton = screen.getByRole('button', { name: 'Accept' });
      fireEvent.click(acceptButton);
      await waitFor(() => expect(mocks.acceptMutate).toHaveBeenCalledOnce());

      act(failRequest);

      await waitFor(() => expect(acceptButton).toBeEnabled());
      expect(sessionStorage.getItem('geo:debate-match-owner:user-for')).toBeNull();
      expect(mocks.push).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: 'Debate readiness' })).not.toBeInTheDocument();
    }
  );

  it('renders each participant position without a per-participant menu', () => {
    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    expect(screen.queryByRole('button', { name: 'More actions for You' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions for Bri' })).not.toBeInTheDocument();
    expect(within(screen.getByText('You').parentElement!).getByText('Yes')).toBeInTheDocument();
    expect(within(screen.getByText('Bri').parentElement!).getByText('No')).toBeInTheDocument();
  });

  it('locks background scrolling while the match dialog is open', () => {
    const { unmount } = render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('hides the format selector from the second participant', async () => {
    mocks.currentUserId.mockReturnValue('user-against');
    mocks.featureFlags.debateFormatSelector = true;

    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    expect(screen.getByText('Debate format')).toBeInTheDocument();
    expect(screen.queryByLabelText('Debate format')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() =>
      expect(mocks.acceptMutate).toHaveBeenCalledWith({ matchId: 'match-1', formatId: undefined }, expect.any(Object))
    );
  });

  it('hides the format selector after the owning participant has accepted', async () => {
    mocks.featureFlags.debateFormatSelector = true;
    const acceptedMatch = match();
    acceptedMatch.participants[0]!.accepted = true;
    seedConfirmedOwnership(acceptedMatch);

    render(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} />);

    expect(await screen.findByRole('dialog', { name: 'Debate readiness' })).toBeInTheDocument();
    expect(screen.getByText('Waiting...')).toBeInTheDocument();
    expect(screen.queryByLabelText('Debate format')).not.toBeInTheDocument();
  });

  it('rejects the matched person for the question', async () => {
    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(mocks.declineMutate).toHaveBeenCalledWith('match-1', expect.any(Object)));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the device pre-screen immediately and moves the first accepter once the debate exists', async () => {
    mocks.featureFlags.debateFormatSelector = true;
    mocks.acceptMutate.mockImplementation((_variables, options) => {
      options.onSuccess({
        match: {
          ...match(),
          participants: match().participants.map(participant =>
            participant.user_id === 'user-for' ? { ...participant, accepted: true } : participant
          ),
        },
        debate: null,
      });
    });

    const { rerender } = render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} debates={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(await screen.findByRole('dialog', { name: 'Debate readiness' })).toBeInTheDocument();
    expect(screen.queryByText('Waiting for the other person')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Debate format')).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();

    const acceptedMatch = match();
    acceptedMatch.participants[0]!.accepted = true;
    rerender(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} debates={[debate()]} />);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/debate-1'));
  });

  it('does not move a server-accepted participant without local ownership', () => {
    const acceptedMatch = match();
    acceptedMatch.participants[0]!.accepted = true;

    render(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} debates={[debate()]} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.beginMediaSession).not.toHaveBeenCalled();
    expect(mocks.promoteMediaSession).not.toHaveBeenCalled();
    expect(mocks.ensurePreview).not.toHaveBeenCalled();
  });

  it('closes a secondary prompt when shared activity reports acceptance and stays on the current page', async () => {
    const underlyingControl = document.createElement('button');
    underlyingControl.textContent = 'Underlying page control';
    document.body.append(underlyingControl);
    underlyingControl.focus();
    const view = render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} debates={[]} />);
    expect(screen.getByRole('dialog', { name: 'The protocol should ship debates' })).toBeInTheDocument();

    const acceptedMatch = match();
    acceptedMatch.participants[0]!.accepted = true;
    view.rerender(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} debates={[debate()]} />);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Debate accepted in another tab.');
    await waitFor(() => expect(underlyingControl).toHaveFocus());
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.beginMediaSession).not.toHaveBeenCalled();
    expect(mocks.ensurePreview).not.toHaveBeenCalled();
    underlyingControl.remove();
  });

  it('closes a retained prompt when shared activity jumps directly to the debate', async () => {
    const view = render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} debates={[]} />);
    expect(screen.getByRole('dialog', { name: 'The protocol should ship debates' })).toBeInTheDocument();

    view.rerender(<DebateMatchPrompt spaceId="space-1" matches={[match()]} debates={[debate()]} />);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Debate accepted in another tab.');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.beginMediaSession).not.toHaveBeenCalled();
    expect(mocks.ensurePreview).not.toHaveBeenCalled();
  });

  it('dismisses a secondary prompt immediately after another tab broadcasts acceptance', async () => {
    const underlyingControl = document.createElement('button');
    document.body.append(underlyingControl);
    underlyingControl.focus();
    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);
    const owner = createDebateMatchTabOwnershipCoordinator({
      matchId: 'match-1',
      claimId: 'claim-1',
      spaceId: 'space-1',
      userId: 'user-for',
      storage: new MemoryStorage(),
      onAcceptedElsewhere: vi.fn(),
    });
    await owner.acquire();
    owner.beginAcceptance();

    owner.confirmAcceptance();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Debate accepted in another tab.');
    await waitFor(() => expect(underlyingControl).toHaveFocus());
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.beginMediaSession).not.toHaveBeenCalled();
    expect(mocks.ensurePreview).not.toHaveBeenCalled();
    owner.close();
    underlyingControl.remove();
  });

  it('queues readiness on the match pre-screen and submits it once the debate exists', async () => {
    mocks.acceptMutate.mockImplementation((_variables, options) => {
      options.onSuccess({
        match: {
          ...match(),
          participants: match().participants.map(participant =>
            participant.user_id === 'user-for' ? { ...participant, accepted: true } : participant
          ),
        },
        debate: null,
      });
    });
    mocks.markReadyMutate.mockImplementation((_variables, options) => options.onSuccess(debate()));

    const acceptedMatch = match();
    acceptedMatch.participants[0]!.accepted = true;
    const view = render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} debates={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    fireEvent.click(await screen.findByRole('button', { name: "I'm ready" }));

    expect(screen.getByRole('button', { name: 'Waiting...' })).toBeDisabled();
    expect(mocks.markReadyMutate).not.toHaveBeenCalled();

    view.rerender(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} debates={[debate()]} />);

    await waitFor(() => expect(mocks.markReadyMutate).toHaveBeenCalledTimes(1));
    expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/debate-1');
    expect(mocks.promoteMediaSession).toHaveBeenCalledWith('match:match-1', 'debate:debate-1');
  });

  it('lets the participant retry queued readiness when the first submission fails', async () => {
    const acceptedMatch = match();
    acceptedMatch.participants[0]!.accepted = true;
    seedConfirmedOwnership(acceptedMatch);
    let failReadiness = () => {};
    mocks.markReadyMutate
      .mockImplementationOnce((_variables, options) => {
        failReadiness = () => options.onError(new Error('Readiness failed'));
      })
      .mockImplementationOnce((_variables, options) => options.onSuccess(debate()));

    const view = render(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} debates={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: "I'm ready" }));
    view.rerender(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} debates={[debate()]} />);

    await waitFor(() => expect(mocks.markReadyMutate).toHaveBeenCalledTimes(1));
    act(failReadiness);

    expect(screen.getByText('Readiness failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "I'm ready" }));

    await waitFor(() => expect(mocks.markReadyMutate).toHaveBeenCalledTimes(2));
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it('revalidates media before submitting queued readiness', async () => {
    const acceptedMatch = match();
    acceptedMatch.participants[0]!.accepted = true;
    seedConfirmedOwnership(acceptedMatch);
    mocks.ensurePreview
      .mockResolvedValueOnce(previewTracks())
      .mockRejectedValueOnce(new Error('Camera disconnected'))
      .mockResolvedValueOnce(previewTracks());

    const view = render(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} debates={[]} />);

    await waitFor(() => expect(mocks.ensurePreview).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: "I'm ready" }));
    view.rerender(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} debates={[debate()]} />);

    await waitFor(() => expect(mocks.ensurePreview).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Camera disconnected')).toBeInTheDocument());
    expect(mocks.markReadyMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: "I'm ready" }));

    await waitFor(() => expect(mocks.markReadyMutate).toHaveBeenCalledTimes(1));
    expect(mocks.ensurePreview).toHaveBeenCalledTimes(3);
  });

  it('prevents leaving while queued readiness is being submitted', async () => {
    const acceptedMatch = match();
    acceptedMatch.participants[0]!.accepted = true;
    seedConfirmedOwnership(acceptedMatch);
    const view = render(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} debates={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: "I'm ready" }));
    mocks.markReadyPending = true;
    view.rerender(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} debates={[debate()]} />);

    await waitFor(() => expect(mocks.markReadyMutate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Leave debate' })).toBeDisabled();
  });

  it('releases the pending media session when the participant leaves the pre-screen', async () => {
    const acceptedMatch = match();
    acceptedMatch.participants[0]!.accepted = true;
    seedConfirmedOwnership(acceptedMatch);

    render(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} debates={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));

    await waitFor(() => expect(mocks.declineMutate).toHaveBeenCalledWith('match-1', expect.any(Object)));
    await waitFor(() => expect(mocks.releaseMediaSession).toHaveBeenCalledWith('match:match-1'));
    expect(screen.queryByRole('dialog', { name: 'Debate readiness' })).not.toBeInTheDocument();
  });

  it('releases the pending media session when the accepted match expires', async () => {
    const acceptedMatch = match();
    acceptedMatch.participants[0]!.accepted = true;
    seedConfirmedOwnership(acceptedMatch);
    const view = render(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} debates={[]} />);

    await screen.findByRole('dialog', { name: 'Debate readiness' });

    view.rerender(<DebateMatchPrompt spaceId="space-1" matches={[]} debates={[]} />);

    await waitFor(() => expect(mocks.releaseMediaSession).toHaveBeenCalledWith('match:match-1'));
    expect(screen.queryByRole('dialog', { name: 'Debate readiness' })).not.toBeInTheDocument();
  });

  it('does not carry confirmed ownership into a replacement match', async () => {
    const acceptedMatch = match();
    acceptedMatch.participants[0]!.accepted = true;
    seedConfirmedOwnership(acceptedMatch);
    const view = render(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} debates={[]} />);

    await screen.findByRole('dialog', { name: 'Debate readiness' });
    mocks.beginMediaSession.mockClear();
    mocks.ensurePreview.mockClear();
    mocks.push.mockClear();

    const replacementMatch = match();
    replacementMatch.id = 'match-2';
    replacementMatch.claim = {
      ...replacementMatch.claim,
      id: 'claim-2',
      claim_entity_id: 'claim-entity-2',
      claim: 'The replacement match stays local',
    };
    const replacementDebate = debate();
    replacementDebate.id = 'debate-2';
    replacementDebate.claim = replacementMatch.claim;

    view.rerender(<DebateMatchPrompt spaceId="space-1" matches={[replacementMatch]} debates={[replacementDebate]} />);

    expect(await screen.findByRole('status')).toHaveTextContent('Debate accepted in another tab.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.beginMediaSession).not.toHaveBeenCalled();
    expect(mocks.ensurePreview).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

function seedConfirmedOwnership(ownedMatch: DebateMatch) {
  const now = Date.now();
  sessionStorage.setItem(
    'geo:debate-match-owner:user-for',
    JSON.stringify({
      version: 1,
      state: 'confirmed',
      userId: 'user-for',
      matchId: ownedMatch.id,
      claimId: ownedMatch.claim.id,
      spaceId: ownedMatch.claim.space_id,
      instanceId: 'previous-instance',
      createdAt: now,
      acceptedAt: now,
    })
  );
  vi.spyOn(performance, 'getEntriesByType').mockImplementation(type =>
    type === 'navigation' ? ([{ type: 'reload' }] as PerformanceNavigationTiming[]) : []
  );
}

function match(): DebateMatch {
  return {
    id: 'match-1',
    status: 'pending',
    claim: {
      id: 'claim-1',
      space_id: 'space-1',
      claim_entity_id: 'claim-entity-1',
      claim: 'The protocol should ship debates',
      description: null,
    },
    participants: [
      {
        user_id: 'user-for',
        profile_space_id: 'profile-for',
        display_name: 'Alex',
        avatar_cid: null,
        participant_slot: 1,
        position: true,
        position_label: 'Yes',
        accepted: false,
      },
      {
        user_id: 'user-against',
        profile_space_id: 'profile-against',
        display_name: 'Bri',
        avatar_cid: null,
        participant_slot: 2,
        position: false,
        position_label: 'No',
        accepted: false,
      },
    ],
    turn_format_id: null,
    debate_id: null,
    created_at: '2026-07-02T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
  };
}

function previewTracks() {
  return [
    { mediaStreamTrack: { kind: 'audio', readyState: 'live' } },
    { mediaStreamTrack: { kind: 'video', readyState: 'live' } },
  ];
}

function debate(): Debate {
  return {
    id: 'debate-1',
    claim: {
      id: 'claim-1',
      space_id: 'space-1',
      claim_entity_id: 'claim-entity-1',
      claim: 'The protocol should ship debates',
      description: null,
    },
    status: 'ready',
    room_name: 'geo-debate-debate-1',
    first_participant_slot: 1,
    current_turn_index: 0,
    current_speaker_slot: null,
    connecting_started_at: null,
    connecting_deadline_at: null,
    turn_started_at: null,
    turn_ends_at: null,
    preflight_ends_at: null,
    turn_format_id: 'quick-open',
    turn_durations_ms: [5000],
    created_at: '2026-07-02T00:00:00.000Z',
    started_at: null,
    completed_at: null,
    participants: [
      {
        user_id: 'user-for',
        profile_space_id: 'profile-for',
        display_name: 'Alex',
        avatar_cid: null,
        participant_slot: 1,
        position: true,
        position_label: 'Yes',
        joined_at: null,
        ready_at: null,
      },
      {
        user_id: 'user-against',
        profile_space_id: 'profile-against',
        display_name: 'Bri',
        avatar_cid: null,
        participant_slot: 2,
        position: false,
        position_label: 'No',
        joined_at: null,
        ready_at: null,
      },
    ],
    recordings: [],
    recording_error: null,
    cancellation_reason: null,
    recording_cancelled_at: null,
    recording_cancelled_by: null,
  };
}
