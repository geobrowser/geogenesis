import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateActivity, DebateRequestsResponse, DebateSharePrompt } from './api';
import { DebateCoordinator } from './debate-coordinator';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  activity: null as DebateActivity | null,
  requests: { outbound: null, incoming: [] } as DebateRequestsResponse,
  acceptRequestMutate: vi.fn(),
  dismissRequestMutate: vi.fn(),
  blockUserMutate: vi.fn(),
  pathname: '/space/space-1/debates',
  prompts: [] as DebateSharePrompt[],
  promptsFetching: false,
  mediaMutate: vi.fn(),
  handleMutate: vi.fn(),
  acceptChallengeMutate: vi.fn(),
  rejectChallengeMutate: vi.fn(),
  fetch: vi.fn(),
  share: vi.fn(),
  canShare: vi.fn(),
  createObjectURL: vi.fn(() => 'blob:https://geo.test/social-video'),
  revokeObjectURL: vi.fn(),
  downloadClick: vi.fn(),
  capture: vi.fn(),
  authenticated: true,
  gatewayPaused: false,
  currentUserId: 'user-for' as string | null,
  refetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => mocks.pathname,
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, getCurrentGeoChatUserId: () => mocks.currentUserId };
});

vi.mock('./hooks', () => ({
  useGeoChatAuth: () => ({ ready: true, authenticated: mocks.authenticated, getPrivyIdentityToken: vi.fn() }),
  useDebateActivity: () => ({ data: mocks.activity, refetch: mocks.refetch }),
  useDebateSharePrompts: () => ({ data: { prompts: mocks.prompts }, isFetching: mocks.promptsFetching }),
  useDebateMediaArtifactUrl: () => ({ mutate: mocks.mediaMutate, error: null }),
  useHandleDebateSharePrompt: () => ({ mutate: mocks.handleMutate, isPending: false }),
  useAcceptDebateChallenge: () => ({ mutate: mocks.acceptChallengeMutate, isPending: false, error: null }),
  useRejectDebateChallenge: () => ({ mutate: mocks.rejectChallengeMutate, isPending: false, error: null }),
}));

vi.mock('./debate-gateway', () => ({
  useDebateGateway: () => ({
    status: mocks.gatewayPaused ? 'degraded' : 'ready',
    paused: mocks.gatewayPaused,
    capabilities: [],
  }),
  useDebateGatewayScope: () => undefined,
}));

vi.mock('./matchmaking/hooks', () => ({
  useDebateRequests: () => ({ data: mocks.requests, isLoading: false, error: null }),
  useAcceptDebateRequest: () => ({ mutate: mocks.acceptRequestMutate, isPending: false, error: null }),
  useDismissDebateRequest: () => ({ mutate: mocks.dismissRequestMutate, isPending: false, error: null }),
  useBlockDebateUser: () => ({ mutate: mocks.blockUserMutate, isPending: false, error: null }),
  useClaimReadiness: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
}));

vi.mock('./claim-response-indexed-notifier', () => ({
  useClaimResponseIndexedNotifier: vi.fn(),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useDebatesEnabled: () => true,
}));

beforeEach(() => {
  sessionStorage.clear();
  mocks.push.mockReset();
  mocks.mediaMutate.mockReset();
  mocks.handleMutate.mockReset();
  mocks.handleMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
  mocks.fetch.mockReset();
  mocks.share.mockReset();
  mocks.canShare.mockReset();
  mocks.createObjectURL.mockClear();
  mocks.revokeObjectURL.mockClear();
  mocks.downloadClick.mockClear();
  mocks.capture.mockReset();
  mocks.activity = null;
  mocks.requests = { outbound: null, incoming: [] };
  mocks.acceptRequestMutate.mockReset();
  mocks.dismissRequestMutate.mockReset();
  mocks.blockUserMutate.mockReset();
  mocks.pathname = '/space/space-1/debates';
  mocks.prompts = [];
  mocks.promptsFetching = false;
  mocks.authenticated = true;
  mocks.gatewayPaused = false;
  mocks.currentUserId = 'user-for';
  mocks.refetch.mockReset();
  Object.defineProperty(navigator, 'share', { configurable: true, value: mocks.share });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: mocks.canShare });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: mocks.createObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: mocks.revokeObjectURL,
  });
  Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
    configurable: true,
    value: mocks.downloadClick,
  });
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.canShare.mockReturnValue(false);
  mocks.fetch.mockResolvedValue(videoResponse());
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('DebateCoordinator', () => {
  it('shows a non-blocking warning while live updates are paused and clears it on recovery', () => {
    mocks.gatewayPaused = true;
    const { rerender } = render(<DebateCoordinator />);

    expect(screen.getByRole('status')).toHaveTextContent('Live debate updates are paused while reconnecting.');

    mocks.gatewayPaused = false;
    rerender(<DebateCoordinator />);
    expect(screen.queryByText('Live debate updates are paused while reconnecting.')).not.toBeInTheDocument();
  });

  it('routes an available participant into a shared rematch browser', async () => {
    mocks.activity = activityWithRematch('browsing');

    render(<DebateCoordinator />);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
  });

  it('leaves a secondary tab on its current page when shared activity contains a debate', async () => {
    mocks.pathname = '/space/space-1/claims';
    mocks.activity = activityWithDebate();

    render(<DebateCoordinator />);

    // Offered, never taken: the tab that accepted routed itself, and yanking every other tab into
    // the room is what the deleted match-ownership handoff existed to prevent.
    expect(await screen.findByRole('button', { name: /Your debate is/ })).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  // GEO-2514: the person who sent the request is told their debate exists, and nothing else tells
  // them — accepting no longer produces a match prompt on either side.
  it('offers a way into a debate the viewer is not looking at', async () => {
    mocks.pathname = '/space/space-1/claims';
    mocks.activity = activityWithDebate();
    mocks.activity.debate = { ...mocks.activity.debate!, status: 'ready', participants: bothParticipants() };

    render(<DebateCoordinator />);

    expect(await screen.findByText('Your debate is ready')).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Join debate' }));

    expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/debate-1');
  });

  it('does not offer a debate the viewer is already in', async () => {
    mocks.pathname = '/space/space-1/debates/debate-1';
    mocks.activity = activityWithDebate();
    mocks.activity.debate = { ...mocks.activity.debate!, status: 'ready', participants: bothParticipants() };

    render(<DebateCoordinator />);

    await waitFor(() => expect(screen.queryByText('Your debate is ready')).not.toBeInTheDocument());
  });

  it('waits for the debate room to finalize its recording before routing to a rematch', async () => {
    mocks.pathname = '/space/space-1/debates/debate-1';
    mocks.activity = activityWithRematch('browsing');

    render(<DebateCoordinator />);

    await waitFor(() => expect(mocks.push).not.toHaveBeenCalled());
  });

  // The rematch the viewer is already looking at, plus the debate it came from still reported in
  // activity. Neither may move them off the rematch page.
  // The popup and its snooze had no coverage at all: the harness mocks the request hooks and never
  // puts a request in the list, so every one of these paths was live and unexercised.
  it('prompts for an incoming request and keeps "Not now" local to this session', async () => {
    mocks.activity = { ...idleActivity(), incoming_request_count: 1 };
    mocks.requests = { outbound: null, incoming: [incomingRequest()] };

    render(<DebateCoordinator />);

    expect(await screen.findByText('Debate request')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    await waitFor(() => expect(screen.queryByText('Debate request')).not.toBeInTheDocument());
    // Local only — nothing was sent, so the request is still the viewer's to answer in the hub.
    expect(mocks.dismissRequestMutate).not.toHaveBeenCalled();
    expect(mocks.acceptRequestMutate).not.toHaveBeenCalled();
  });

  // A claimless challenge interrupts the person who has to answer it, and nobody else. The sender
  // has no decision to make, so their copy lives under Sent in the hub's Requests tab.
  it('prompts the recipient of a claimless challenge', async () => {
    mocks.currentUserId = 'user-recipient';
    mocks.activity = { ...idleActivity(), challenge: pendingChallenge() };

    render(<DebateCoordinator />);

    expect(await screen.findByText('Debate request')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore claims' })).toBeInTheDocument();
  });

  it('does not interrupt the sender of a challenge while it waits to be answered', async () => {
    mocks.currentUserId = 'user-requester';
    mocks.activity = { ...idleActivity(), challenge: pendingChallenge() };

    render(<DebateCoordinator />);

    await waitFor(() => expect(screen.queryByText('Debate request')).not.toBeInTheDocument());
    expect(screen.queryByText(/Waiting for .* to accept/)).not.toBeInTheDocument();
  });

  // The sender learns it was accepted the same way every other flow does: activity gains a rematch
  // and the routing effect walks them into the claim picker. No popup is involved either way.
  it('routes the sender into the claim picker once the challenge is accepted', async () => {
    mocks.currentUserId = 'user-requester';
    mocks.pathname = '/space/space-1/claims';
    mocks.activity = { ...activityWithRematch('browsing'), challenge: null };

    render(<DebateCoordinator />);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
  });

  it('does not prompt for a request while a debate is under way', async () => {
    mocks.pathname = '/space/space-1/claims';
    mocks.activity = { ...activityWithDebate(), incoming_request_count: 1 };
    mocks.requests = { outbound: null, incoming: [incomingRequest()] };

    render(<DebateCoordinator />);

    await waitFor(() => expect(screen.queryByText('Debate request')).not.toBeInTheDocument());
  });

  it('does not route stale debate activity over an active rematch page', async () => {
    mocks.pathname = '/space/space-1/debates/rematches/rematch-1';
    mocks.activity = {
      ...activityWithRematch('browsing'),
      debate: {
        id: 'debate-1',
        claim: { space_id: 'space-1' },
        participants: bothParticipants(),
      } as NonNullable<DebateActivity['debate']>,
    };

    render(<DebateCoordinator />);

    await waitFor(() => expect(mocks.push).not.toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Your debate is/ })).not.toBeInTheDocument();
  });

  it.each(['complete', 'cancelled'] as const)('does not reopen a %s debate from stale activity', async status => {
    mocks.pathname = '/space/space-1/claims';
    mocks.activity = {
      ...activityWithDebate(),
      debate: {
        ...activityWithDebate().debate!,
        status,
        participants: bothParticipants(),
      },
    };

    render(<DebateCoordinator />);

    await waitFor(() => expect(mocks.push).not.toHaveBeenCalled());
    expect(screen.queryByText('Your debate is ready')).not.toBeInTheDocument();
  });

  it('requests the exact social preview and starts preparing the MP4 on open', async () => {
    showSharePrompt();
    let resolveDownload: ((response: Response) => void) | undefined;
    mocks.fetch.mockReturnValue(new Promise(resolve => (resolveDownload = resolve)));
    mocks.mediaMutate.mockImplementation((variables, options) => {
      const url =
        variables.request.kind === 'social_preview_image'
          ? 'https://video.test/social-preview.jpg'
          : 'https://video.test/social.mp4';
      options.onSuccess({ upload: { url } });
    });

    render(<DebateCoordinator />);

    expect(await screen.findByLabelText('Social video for Debates are useful')).toHaveAttribute(
      'poster',
      'https://video.test/social-preview.jpg'
    );
    expect(mocks.mediaMutate).toHaveBeenCalledWith(
      { debateId: 'debate-1', request: { kind: 'social_preview_image' } },
      expect.any(Object)
    );
    expect(mocks.mediaMutate).toHaveBeenCalledWith(
      { debateId: 'debate-1', request: { kind: 'social_video' } },
      expect.any(Object)
    );
    expect(mocks.fetch).toHaveBeenCalledWith('https://video.test/social.mp4', { signal: expect.any(AbortSignal) });
    expect(screen.getAllByText('Preparing video…')).toHaveLength(2);
    expect(screen.getByRole('progressbar', { name: 'Preparing social video' })).not.toHaveAttribute('aria-valuenow');

    resolveDownload?.(videoResponse());
    expect(await screen.findByRole('button', { name: 'Download video' })).toBeEnabled();
  });

  it('allows the social video to play while share preparation is still in progress', async () => {
    showSharePrompt();
    mockArtifactUrls();
    mocks.fetch.mockReturnValue(new Promise(() => undefined));

    render(<DebateCoordinator />);

    const player = await screen.findByLabelText('Social video for Debates are useful');
    expect(player).toBeInstanceOf(HTMLVideoElement);
    expect(player).toHaveAttribute('src', 'https://video.test/social.mp4');
    expect(player).toHaveAttribute('controls');
    expect(screen.getByRole('button', { name: 'Preparing video…' })).toBeDisabled();
  });

  it('shares only the prepared MP4 and claim through the native share sheet', async () => {
    showSharePrompt();
    mockArtifactUrls();
    mocks.canShare.mockReturnValue(true);
    mocks.share.mockResolvedValue(undefined);
    mocks.capture.mockImplementation(() => {
      throw new Error('Analytics unavailable');
    });

    const view = render(<DebateCoordinator />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share video' }));

    const file = mocks.canShare.mock.calls.at(-1)?.[0].files[0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('debate-debate-1-social.mp4');
    expect(file.type).toBe('video/mp4');
    expect(mocks.share).toHaveBeenCalledWith({ title: 'Debates are useful', files: [file] });
    expect(mocks.share.mock.calls[0]?.[0]).not.toHaveProperty('url');
    expect(mocks.share.mock.calls[0]?.[0]).not.toHaveProperty('text');
    await waitFor(() => {
      expect(mocks.capture).toHaveBeenCalledWith('debate_social_video_handoff_resolved', {
        debate_id: 'debate-1',
        method: 'native_share',
      });
      expect(mocks.handleMutate).toHaveBeenCalledWith({ promptId: 'prompt-1', action: 'shared' }, expect.any(Object));
    });

    mocks.prompts = [];
    view.rerender(<DebateCoordinator />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.handleMutate).toHaveBeenCalledTimes(1);
  });

  it('does not reopen a cached share prompt after an active debate flow', async () => {
    showSharePrompt();
    mockArtifactUrls();
    const view = render(<DebateCoordinator />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    mocks.activity = activityWithDebate();
    view.rerender(<DebateCoordinator />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    mocks.activity = {
      online: true,
      available_to_debate: true,
      cooldown_until: null,
      match: null,
      debate: null,
      rematch: null,
      challenge: null,
    };
    mocks.promptsFetching = true;
    view.rerender(<DebateCoordinator />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    mocks.prompts = [];
    mocks.promptsFetching = false;
    view.rerender(<DebateCoordinator />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the prompt open when the native share sheet is cancelled', async () => {
    showSharePrompt();
    mockArtifactUrls();
    mocks.canShare.mockReturnValue(true);
    mocks.share.mockRejectedValue(new DOMException('Cancelled', 'AbortError'));

    render(<DebateCoordinator />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share video' }));

    await waitFor(() => expect(mocks.share).toHaveBeenCalled());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.handleMutate).not.toHaveBeenCalledWith({ promptId: 'prompt-1', action: 'shared' });
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();
  });

  it('shows sharing failures without handling the prompt and allows retry', async () => {
    showSharePrompt();
    mockArtifactUrls();
    mocks.canShare.mockReturnValue(true);
    mocks.share.mockRejectedValueOnce(new Error('Share service unavailable')).mockResolvedValueOnce(undefined);

    render(<DebateCoordinator />);
    const shareButton = await screen.findByRole('button', { name: 'Share video' });
    fireEvent.click(shareButton);

    expect(await screen.findByText('Share service unavailable')).toBeInTheDocument();
    expect(mocks.handleMutate).not.toHaveBeenCalledWith({ promptId: 'prompt-1', action: 'shared' });

    fireEvent.click(shareButton);
    await waitFor(() =>
      expect(mocks.handleMutate).toHaveBeenCalledWith({ promptId: 'prompt-1', action: 'shared' }, expect.any(Object))
    );
    expect(mocks.share).toHaveBeenCalledTimes(2);
  });

  it('downloads the prepared MP4 when browser file sharing is unsupported', async () => {
    showSharePrompt();
    mockArtifactUrls();
    mocks.canShare.mockReturnValue(false);

    const view = render(<DebateCoordinator />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download video' }));

    expect(mocks.downloadClick).toHaveBeenCalledTimes(1);
    const downloadLink = mocks.downloadClick.mock.instances[0] as HTMLAnchorElement;
    expect(downloadLink.href).toBe('blob:https://geo.test/social-video');
    expect(downloadLink.download).toBe('debate-debate-1-social.mp4');
    expect(mocks.share).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith('debate_social_video_handoff_resolved', {
      debate_id: 'debate-1',
      method: 'download',
    });
    await waitFor(() =>
      expect(mocks.handleMutate).toHaveBeenCalledWith({ promptId: 'prompt-1', action: 'shared' }, expect.any(Object))
    );

    mocks.prompts = [];
    view.rerender(<DebateCoordinator />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.handleMutate).toHaveBeenCalledTimes(1);
  });

  it('shows a retryable preparation error and retries the same social MP4', async () => {
    showSharePrompt();
    mockArtifactUrls();
    mocks.fetch.mockRejectedValueOnce(new Error('Network interrupted')).mockResolvedValueOnce(videoResponse());

    render(<DebateCoordinator />);

    expect(await screen.findByText('Network interrupted')).toBeInTheDocument();
    expect(mocks.capture).toHaveBeenCalledWith('debate_social_video_preparation_failed', {
      debate_id: 'debate-1',
      stage: 'video_download',
      error_name: 'Error',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry preparation' }));

    expect(await screen.findByRole('button', { name: 'Download video' })).toBeEnabled();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps active playback mounted while retrying share preparation', async () => {
    showSharePrompt();
    let socialVideoRequests = 0;
    mocks.mediaMutate.mockImplementation((variables, options) => {
      if (variables.request.kind === 'social_preview_image') {
        options.onSuccess({ upload: { url: 'https://video.test/social-preview.jpg' } });
        return;
      }
      socialVideoRequests += 1;
      if (socialVideoRequests === 1) {
        options.onSuccess({ upload: { url: 'https://video.test/social.mp4' } });
      }
    });
    mocks.fetch.mockRejectedValueOnce(new Error('Network interrupted'));

    render(<DebateCoordinator />);

    expect(await screen.findByText('Network interrupted')).toBeInTheDocument();
    const player = screen.getByLabelText('Social video for Debates are useful') as HTMLVideoElement;
    player.currentTime = 23;

    fireEvent.click(screen.getByRole('button', { name: 'Retry preparation' }));
    await waitFor(() => expect(socialVideoRequests).toBe(2));

    expect(screen.getByLabelText('Social video for Debates are useful')).toBe(player);
    expect(player.currentTime).toBe(23);
  });

  it('revokes prepared playback URLs when the prompt closes', async () => {
    showSharePrompt();
    mockArtifactUrls();

    const { rerender } = render(<DebateCoordinator />);
    await screen.findByRole('button', { name: 'Download video' });
    fireEvent.click(screen.getByRole('button', { name: 'Close share prompt' }));

    rerender(<DebateCoordinator />);
    await waitFor(() => expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:https://geo.test/social-video'));
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
    expect(mocks.handleMutate).toHaveBeenCalledWith({ promptId: 'prompt-1', action: 'dismissed' }, expect.any(Object));
  });

  it('uses download fallback when the browser capability probe throws', async () => {
    showSharePrompt();
    mockArtifactUrls();
    mocks.canShare.mockImplementation(() => {
      throw new TypeError('Unsupported share payload');
    });

    render(<DebateCoordinator />);

    expect(await screen.findByRole('button', { name: 'Download video' })).toBeEnabled();
  });

  it('aborts an in-flight MP4 download when the prompt closes', async () => {
    showSharePrompt();
    mockArtifactUrls();
    let downloadSignal: AbortSignal | undefined;
    mocks.fetch.mockImplementation((_url, init) => {
      downloadSignal = init.signal;
      return new Promise(() => undefined);
    });

    render(<DebateCoordinator />);
    await waitFor(() => expect(downloadSignal).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Close share prompt' }));

    await waitFor(() => expect(downloadSignal?.aborted).toBe(true));
  });

  it('prevents duplicate native share requests while the share sheet is open', async () => {
    showSharePrompt();
    mockArtifactUrls();
    mocks.canShare.mockReturnValue(true);
    let resolveShare: (() => void) | undefined;
    mocks.share.mockReturnValue(new Promise<void>(resolve => (resolveShare = resolve)));

    render(<DebateCoordinator />);
    const shareButton = await screen.findByRole('button', { name: 'Share video' });
    fireEvent.click(shareButton);
    fireEvent.click(shareButton);

    expect(mocks.share).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Sharing…' })).toBeDisabled();

    resolveShare?.();
    await waitFor(() => expect(mocks.handleMutate).toHaveBeenCalledTimes(1));
  });

  it('retries prompt completion without sharing the video a second time', async () => {
    showSharePrompt();
    mockArtifactUrls();
    mocks.canShare.mockReturnValue(true);
    mocks.share.mockResolvedValue(undefined);
    mocks.handleMutate
      .mockImplementationOnce((_variables, options) => options?.onError?.(new Error('Network unavailable')))
      .mockImplementationOnce((_variables, options) => options?.onSuccess?.());

    render(<DebateCoordinator />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share video' }));

    expect(
      await screen.findByText("The video was handed off, but Geo couldn't finish updating this prompt. Try again.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish sharing' }));

    expect(await screen.findByRole('button', { name: 'Done' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.share).toHaveBeenCalledTimes(1);
    expect(mocks.handleMutate).toHaveBeenCalledTimes(2);
  });

  it('keeps the prompt visible when dismissing it fails and allows retry', async () => {
    showSharePrompt();
    mockArtifactUrls();
    mocks.handleMutate
      .mockImplementationOnce((_variables, options) => options?.onError?.(new Error('Network unavailable')))
      .mockImplementationOnce((_variables, options) => options?.onSuccess?.());

    render(<DebateCoordinator />);
    fireEvent.click(screen.getByRole('button', { name: 'Close share prompt' }));

    expect(await screen.findByText('Could not dismiss the share prompt. Try again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close share prompt' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.handleMutate).toHaveBeenCalledTimes(2);
  });

  it('prevents duplicate prompt mutations while dismissal is in flight', async () => {
    showSharePrompt();
    mockArtifactUrls();
    let completeDismissal: (() => void) | undefined;
    mocks.handleMutate.mockImplementation((_variables, options) => {
      completeDismissal = options?.onSuccess;
    });

    render(<DebateCoordinator />);
    const closeButton = screen.getByRole('button', { name: 'Close share prompt' });
    fireEvent.click(closeButton);
    fireEvent.click(closeButton);

    expect(mocks.handleMutate).toHaveBeenCalledTimes(1);
    expect(closeButton).toBeDisabled();

    completeDismissal?.();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

function showSharePrompt() {
  mocks.activity = {
    online: true,
    available_to_debate: true,
    cooldown_until: null,
    match: null,
    debate: null,
    rematch: null,
    challenge: null,
  };
  mocks.prompts = [
    {
      id: 'prompt-1',
      debate_id: 'debate-1',
      source_space_id: 'space-1',
      claim: 'Debates are useful',
      created_at: '2026-07-02T00:00:00.000Z',
    },
  ];
}

function mockArtifactUrls() {
  mocks.mediaMutate.mockImplementation((variables, options) => {
    const url =
      variables.request.kind === 'social_preview_image'
        ? 'https://video.test/social-preview.jpg'
        : 'https://video.test/social.mp4';
    options.onSuccess({ upload: { url } });
  });
}

function videoResponse() {
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'content-type': 'video/mp4', 'content-length': '4' },
  });
}

function activityWithRematch(status: 'deciding' | 'browsing'): DebateActivity {
  return {
    online: true,
    available_to_debate: true,
    cooldown_until: null,
    match: null,
    debate: null,
    rematch: {
      id: 'rematch-1',
      source_debate_id: 'debate-1',
      source_space_id: 'space-1',
      status,
      participants: [],
      decision_expires_at: '2026-07-02T00:00:20.000Z',
      browsing_expires_at: null,
      request: null,
      converted_debate_id: null,
      recently_rejected_claim_ids: [],
      created_at: '2026-07-02T00:00:00.000Z',
      updated_at: '2026-07-02T00:00:00.000Z',
    },
    challenge: null,
  };
}

function activityWithDebate(): DebateActivity {
  return {
    online: true,
    available_to_debate: true,
    cooldown_until: null,
    match: null,
    debate: {
      id: 'debate-1',
      claim: {
        id: 'claim-1',
        space_id: 'space-1',
        claim_entity_id: 'claim-entity-1',
        claim: 'Debates should hand off without flashing the page',
        description: null,
      },
      participants: [{ user_id: 'user-for' }],
    } as NonNullable<DebateActivity['debate']>,
    rematch: null,
    challenge: null,
  };
}

/** The ready prompt describes both sides, so it only surfaces for a debate that names them. */
function bothParticipants(): NonNullable<DebateActivity['debate']>['participants'] {
  return [
    { user_id: 'user-for', profile_space_id: 'space-for', display_name: 'You', participant_slot: 1, position: true },
    {
      user_id: 'user-against',
      profile_space_id: 'space-against',
      display_name: 'Salina Mitchell',
      participant_slot: 2,
      position: false,
    },
  ] as NonNullable<DebateActivity['debate']>['participants'];
}

function idleActivity(): DebateActivity {
  return {
    online: true,
    available_to_debate: true,
    cooldown_until: null,
    match: null,
    debate: null,
    rematch: null,
    challenge: null,
  };
}

function pendingChallenge() {
  const party = (userId: string, name: string) => ({
    user_id: userId,
    profile_space_id: `space-${userId}`,
    display_name: name,
    avatar_cid: null,
  });

  return {
    id: 'challenge-1',
    status: 'pending',
    source_space_id: 'space-1',
    requester: party('user-requester', 'Ada'),
    recipient: party('user-recipient', 'Grace'),
    rematch_session_id: null,
    created_at: '2026-08-12T11:00:00.000Z',
    // Comfortably ahead of the countdown filter, which drops expired challenges before they prompt.
    expires_at: '2099-01-01T00:00:00.000Z',
  } as DebateActivity['challenge'];
}

function incomingRequest() {
  const party = (userId: string, name: string, position: boolean) => ({
    user_id: userId,
    profile_space_id: `space-${userId}`,
    display_name: name,
    avatar_cid: null,
    online: true,
    available_to_debate: true,
    in_debate: false,
    online_since: '2026-08-11T11:00:00.000Z',
    position,
    position_label: position ? 'Yes' : 'No',
  });

  return {
    id: 'request-1',
    status: 'pending',
    claim: {
      id: 'claim-row-1',
      space_id: 'space-1',
      claim_entity_id: 'claim-entity-1',
      claim: 'Debates should hand off without flashing the page',
      description: null,
    },
    requester: party('user-against', 'Salina Mitchell', false),
    recipient: party('user-for', 'You', true),
    turn_format_id: null,
    created_at: '2026-08-11T12:00:00.000Z',
    expires_at: '2099-01-01T00:00:00.000Z',
  } as unknown as NonNullable<DebateRequestsResponse['incoming']>[number];
}
