import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { parseTweet } from 'twitter-text';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import { parseShareLink } from '~/core/sharing/share-link';

import { DebateShareDialog } from './share-dialog';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  download: vi.fn(),
  retry: vi.fn(),
  status: 'ready',
  artifacts: [{ kind: 'social_video' }] as { kind: string }[],
  prepared: vi.fn(),
  canShareVideo: false,
  coarsePointer: false,
  handoff: vi.fn(),
  windowOpen: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('~/core/analytics', () => ({ capture: mocks.capture, analyticsContextRevision: () => 0 }));
vi.mock('~/core/debates/hooks', () => ({
  useDebateMedia: () => ({ data: { artifacts: mocks.artifacts } }),
}));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.toast] }));
vi.mock('../social-video-share', async importOriginal => ({
  ...(await importOriginal<typeof import('../social-video-share')>()),
  canNativeShareVideo: () => mocks.canShareVideo,
  downloadPreparedVideo: mocks.download,
  handoffPreparedSocialVideo: mocks.handoff,
  isAbortError: () => false,
  usePreparedSocialVideo: (_debateId: string, options: { enabled: boolean; captions?: string }) => {
    mocks.prepared(options);
    const captions = options.captions ?? 'captioned';
    return {
      status: mocks.status,
      downloadUrl: `blob:${captions}`,
      file: { name: `${captions}.mp4` },
      progressPercent: null,
      error: null,
      retry: mocks.retry,
    };
  },
}));
const debate = { id: 'debate', claim: { claim: 'Private claim text' } } as Debate;
const cases = [
  ['Share on Reddit', 'reddit'],
  ['Share on X', 'x'],
  ['Share on LinkedIn', 'linkedin'],
  ['Download debate video', 'download'],
] as const;
/** The download hands off from the caption step, after the Download tile opens it. */
function press(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
  if (label === 'Download debate video') fireEvent.click(screen.getByRole('button', { name: 'With captions' }));
}
const completed = () => mocks.capture.mock.calls.filter(([event]) => event === 'action_completed');
function mount(data = debate, spaceId = 'space') {
  render(
    <DebateShareDialog
      open
      onOpenChange={vi.fn()}
      debate={data}
      spaceId={spaceId}
      openerRef={React.createRef<HTMLButtonElement>()}
    />
  );
}
beforeEach(() => {
  mocks.status = 'ready';
  mocks.artifacts = [{ kind: 'social_video' }];
  mocks.canShareVideo = false;
  mocks.handoff.mockReset().mockResolvedValue('native_share');
  vi.stubGlobal('open', mocks.windowOpen);
  mocks.windowOpen.mockReset();
  mocks.toast.mockReset();

  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: query.includes('coarse') ? mocks.coarsePointer : false }) as MediaQueryList
  );
  mocks.coarsePointer = true;
});
afterEach(() => {
  delete window.lytics;
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.capture.mockReset();
  mocks.download.mockReset();
  mocks.retry.mockReset();
  mocks.prepared.mockReset();
});

it.each(cases.filter(([, method]) => method !== 'download'))(
  'records %s failures around the actual handoff',
  (label, method) => {
    const error = new Error('handoff failed');
    const handoff = () => {
      throw error;
    };
    vi.spyOn(window, 'open').mockImplementation(handoff);
    mocks.download.mockImplementation(handoff);
    const reported: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      reported.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      mount();
      press(label);
      expect(reported).toContain(error); // preserve the original thrown-handler behavior
      expect(completed()).toHaveLength(1);
      expect(completed()[0][1]).toMatchObject({ outcome: 'failed', failure_code: 'unavailable', target_id: 'debate' });
      expect(mocks.capture).not.toHaveBeenCalledWith('debate_share_action', expect.objectContaining({ method }));
    } finally {
      window.removeEventListener('error', onError);
    }
  }
);

it('records a failed download and keeps the error inside the sheet', () => {
  mocks.download.mockImplementation(() => {
    throw new Error('download failed');
  });
  mount();
  press('Download debate video');
  expect(completed()).toHaveLength(1);
  expect(completed()[0][1]).toMatchObject({ outcome: 'failed', failure_code: 'unavailable', target_id: 'debate' });
  expect(mocks.capture).not.toHaveBeenCalledWith(
    'debate_share_action',
    expect.objectContaining({ method: 'download' })
  );
});

it.each(cases)('records %s only after the synchronous handoff returns', (label, method) => {
  let outcomesAtHandoff = -1;
  const handoff = () => {
    outcomesAtHandoff = completed().length;
    return null;
  };
  const open = vi.spyOn(window, 'open').mockImplementation(handoff);
  mocks.download.mockImplementation(handoff);
  mount();
  press(label);
  expect(method === 'download' ? mocks.download : open).toHaveBeenCalledTimes(1);
  expect(outcomesAtHandoff).toBe(0);
  expect(completed()).toHaveLength(1);
  expect(completed()[0][1]).toMatchObject({
    outcome: method === 'download' ? 'succeeded' : 'unknown',
    overlay: 'modal',
  });
  expect(JSON.stringify(completed())).not.toContain('Private claim text');
});

it('retries preparation without claiming a completed download', () => {
  mocks.status = 'error';
  mount();
  press('Download debate video');
  expect(mocks.retry).toHaveBeenCalledTimes(1);
  expect(completed()).toHaveLength(0);
  expect(mocks.download).not.toHaveBeenCalled();
});

it('asks about captions before saving anything, and Back saves nothing', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Download debate video' }));
  expect(screen.getByRole('heading', { name: 'Download video' })).toBeTruthy();
  expect(mocks.download).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Back to share options' }));
  expect(screen.getByRole('button', { name: 'Share on Reddit' })).toBeTruthy();
  expect(mocks.download).not.toHaveBeenCalled();
  expect(completed()).toHaveLength(0);
});

it('downloads the captioned video and records that it had captions', () => {
  mount();
  press('Download debate video');
  expect(mocks.download).toHaveBeenCalledWith('blob:captioned', 'captioned.mp4');
  expect(mocks.capture).toHaveBeenCalledWith('debate_share_action', expect.objectContaining({ captions: true }));
});

it('fetches the clean video only once chosen and downloads it when ready', () => {
  mocks.artifacts = [{ kind: 'social_video' }, { kind: 'social_video_uncaptioned' }];
  mount();
  // Opening the sheet prepares only the captioned file.
  expect(mocks.prepared).toHaveBeenCalledWith(expect.objectContaining({ captions: 'uncaptioned', enabled: false }));
  expect(mocks.prepared).not.toHaveBeenCalledWith(expect.objectContaining({ captions: 'uncaptioned', enabled: true }));

  fireEvent.click(screen.getByRole('button', { name: 'Download debate video' }));
  fireEvent.click(screen.getByRole('button', { name: 'Without captions' }));
  expect(mocks.prepared).toHaveBeenCalledWith(expect.objectContaining({ captions: 'uncaptioned', enabled: true }));
  expect(mocks.download).toHaveBeenCalledWith('blob:uncaptioned', 'uncaptioned.mp4');
  expect(mocks.capture).toHaveBeenCalledWith('debate_share_action', expect.objectContaining({ captions: false }));
});

it('marks the clean video unavailable for a debate rendered before it existed', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Download debate video' }));
  const clean = screen.getByRole<HTMLButtonElement>('button', { name: /Without captions/ });
  expect(clean.disabled).toBe(true);
  expect(screen.getByText('Not available for this debate')).toBeTruthy();
  fireEvent.click(clean);
  expect(mocks.prepared).not.toHaveBeenCalledWith(expect.objectContaining({ captions: 'uncaptioned', enabled: true }));
  expect(mocks.download).not.toHaveBeenCalled();
});

const realDebate = {
  ...debate,
  id: '11111111111141118111111111111111',
  participants: [{ profile_space_id: '22222222222242228222222222222222' }],
} as Debate;
const handoffs = () => mocks.capture.mock.calls.filter(([name]) => name === 'share_link_handoff');

it('preserves the LinkedIn caption allowance independently of the tracked destination length', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const claim = 'A'.repeat(600);
  mount({ ...realDebate, claim: { ...realDebate.claim, claim } }, '33333333-3333-4333-8333-333333333333');
  fireEvent.click(screen.getByRole('button', { name: 'Share on LinkedIn' }));
  const text = new URL(open.mock.calls[0][0] as string).searchParams.get('text')!;
  const [caption, destination] = text.split('\n');
  expect(caption).toBe(`${claim}. Watch the debate on Geo!`);
  expect(parseShareLink(new URL(destination).searchParams)).toMatchObject({ method: 'linkedin' });
  expect(handoffs()[0][1].share_id).toBe(parseShareLink(new URL(destination).searchParams)!.share_id);
});

it.each([
  'Sharing knowledge helps people make better decisions together',
  'Sharing knowledge helps people make better decisions together. '.repeat(8),
])('budgets X composer text using the shortened link weight for UUID destinations: %s', claim => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  mount({ ...realDebate, claim: { ...realDebate.claim, claim } }, '33333333-3333-4333-8333-333333333333');
  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));

  const composer = new URL(open.mock.calls[0][0] as string);
  const destination = new URL(composer.searchParams.get('url')!);
  const text = composer.searchParams.get('text')!;
  expect(destination.href.length).toBeGreaterThan(240);
  expect(parseShareLink(destination.searchParams)).toMatchObject({ method: 'x', share_content_id: realDebate.id });
  expect(destination.pathname).toContain('33333333-3333-4333-8333-333333333333');
  expect(text).toContain('Sharing knowledge helps people make better decisions together');
  expect(text).toMatch(/\. Watch the debate on Geo!$/);
  expect(text.length + 1 + 23).toBeLessThanOrEqual(280);
  if (claim.length < 100) expect(text).toBe(`${claim}. Watch the debate on Geo!`);
  else expect(text).toContain('…');
  expect(handoffs()).toHaveLength(1);
  expect(handoffs()[0][1].share_id).toBe(parseShareLink(destination.searchParams)!.share_id);
});

it.each([
  ['mixed scripts', `${'a'.repeat(120)}${'中'.repeat(100)}`],
  ['CJK', '中'.repeat(200)],
  ['surrogate pairs', '🚀'.repeat(180)],
  ['joined emoji', '👨‍👩‍👧‍👦'.repeat(80)],
  ['combining marks', 'cafe\u0301 '.repeat(65)],
  ['grapheme boundary', `${'a'.repeat(227)}${'कि'.repeat(40)}`],
  ['short multilingual text', `${'a'.repeat(120)}${'中'.repeat(30)}`],
  ['an embedded URL', `https://example.com/${'long-path/'.repeat(35)} ${'中'.repeat(100)}`],
])('keeps the X composer within its weighted limit for %s', (_label, claim) => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  mount({ ...realDebate, claim: { ...realDebate.claim, claim } }, '33333333-3333-4333-8333-333333333333');
  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));
  const composer = new URL(open.mock.calls[0][0] as string);
  const text = composer.searchParams.get('text')!;
  const destination = new URL(composer.searchParams.get('url')!);
  // The test origin is localhost; use the public origin for X's URL recognizer.
  const publicDestination = new URL(`${destination.pathname}${destination.search}`, 'https://geobrowser.io').href;
  expect(parseTweet(`${text}\n${publicDestination}`).weightedLength).toBeLessThanOrEqual(280);
  expect(text).toMatch(/\. Watch the debate on Geo!$/);
  const prefix = text.slice(0, -'. Watch the debate on Geo!'.length).replace(/…$/, '');
  const normalizedClaim = claim.trim().normalize('NFC');
  expect(normalizedClaim.startsWith(prefix)).toBe(true);
  const boundaries = [...new Intl.Segmenter().segment(normalizedClaim)].map(
    ({ index, segment }) => index + segment.length
  );
  expect(boundaries).toContain(prefix.length);
  if (parseTweet(`${normalizedClaim}. Watch the debate on Geo!\n${publicDestination}`).weightedLength <= 280) {
    expect(text).toBe(`${normalizedClaim}. Watch the debate on Geo!`);
  }
  if (['mixed scripts', 'CJK', 'surrogate pairs', 'grapheme boundary'].includes(_label)) {
    const next = [...new Intl.Segmenter().segment(normalizedClaim)].find(
      ({ index }) => index === prefix.length
    )!.segment;
    expect(
      parseTweet(`${prefix}${next}…. Watch the debate on Geo!\n${publicDestination}`).weightedLength
    ).toBeGreaterThan(280);
  }
  expect(handoffs()).toHaveLength(1);
  expect(handoffs()[0][1].share_id).toBe(parseShareLink(destination.searchParams)!.share_id);
});

it.each(cases.slice(0, 3))('correlates the tagged %s destination with its synchronous handoff', (label, method) => {
  let recordsAtOpen = -1;
  const open = vi.spyOn(window, 'open').mockImplementation(() => {
    recordsAtOpen = handoffs().length;
    return null;
  });
  window.lytics = {
    getContext: () => ({ is_identified: true }),
    getIdentity: () => ({ personal_space_id: realDebate.participants[0].profile_space_id }),
  };
  mount(realDebate);
  fireEvent.click(screen.getByRole('button', { name: label }));
  const composer = new URL(open.mock.calls[0][0] as string);
  const destination =
    method === 'linkedin' ? composer.searchParams.get('text')!.split('\n').at(-1)! : composer.searchParams.get('url')!;
  expect(recordsAtOpen).toBe(0);
  expect(handoffs()).toHaveLength(1);
  expect(handoffs()[0][1]).toMatchObject({
    ...parseShareLink(new URL(destination).searchParams),
    method,
    sharer_role: 'debater',
    handoff_kind: 'composer_requested',
    space_id: 'space',
  });
  expect(destination).not.toContain(realDebate.participants[0].profile_space_id);
});

it('gives repeated copies different IDs and never counts downloads as link handoffs', async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } });
  mount(realDebate);
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
  await waitFor(() => expect(handoffs()).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
  await waitFor(() => expect(handoffs()).toHaveLength(2));
  const ids = write.mock.calls.map(([url]) => parseShareLink(new URL(url).searchParams)!.share_id);
  expect(ids[0]).not.toBe(ids[1]);
  expect(handoffs().map(([, props]) => props.share_id)).toEqual(ids);
  press('Download debate video');
  expect(handoffs()).toHaveLength(2);
});

it('does not record a link handoff when the clipboard rejects', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
  });
  mount(realDebate);
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
  await waitFor(() => expect(completed()).toHaveLength(1));
  expect(handoffs()).toHaveLength(0);
});

/*
 * One tile, two hand-offs. X's intent URL reaches the composer directly but has no media parameter,
 * so a video can only travel through the system share sheet — which the device has to offer.
 */
it('hands the video to the share sheet when the device can carry one', async () => {
  mocks.canShareVideo = true;
  mount();

  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));
  await vi.waitFor(() => expect(mocks.handoff).toHaveBeenCalledTimes(1));

  expect(mocks.handoff.mock.calls[0][0]).toMatchObject({ debateId: 'debate', file: { name: 'captioned.mp4' } });
  expect(mocks.windowOpen).not.toHaveBeenCalled();
});

it('falls back to the X composer when the device cannot share files', () => {
  mocks.canShareVideo = false;
  mount();

  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));

  expect(mocks.handoff).not.toHaveBeenCalled();
  expect(mocks.windowOpen.mock.calls[0][0]).toContain('twitter.com/intent/tweet');
});

// The video is prepared while the sheet is open, so a tap before it lands must still reach X.
it('falls back to the composer while the video is still preparing', () => {
  mocks.canShareVideo = true;
  mocks.status = 'preparing';
  mount();

  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));

  expect(mocks.handoff).not.toHaveBeenCalled();
  expect(mocks.windowOpen.mock.calls[0][0]).toContain('twitter.com/intent/tweet');
});

// A second tap calls `share()` while a sheet is already open, which throws `NotAllowedError` — and
// that is classified unretryable, so the video would silently download instead.
/*
 * `canShare({files})` answers true on desktop Chrome and then `share()` refuses, so the capability
 * check alone took the X button away from the composer it has always opened — on every desktop.
 */
it('keeps the X composer on a desktop pointer, whatever canShare says', () => {
  mocks.canShareVideo = true;
  mocks.coarsePointer = false;
  mount();

  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));

  expect(mocks.handoff).not.toHaveBeenCalled();
  expect(mocks.windowOpen.mock.calls[0][0]).toContain('twitter.com/intent/tweet');
});

type Unshareable = { onUnshareable?: (info: { userActivationSpent: boolean }) => void };
const refuses =
  (userActivationSpent: boolean) =>
  async ({ onUnshareable }: Unshareable) => {
    onUnshareable?.({ userActivationSpent });
    return 'unshareable';
  };

//Refused before anything was shared — `canShare` said no.
it('opens the X composer when the file was never shareable, rather than downloading', async () => {
  mocks.canShareVideo = true;
  mocks.handoff.mockImplementation(refuses(false));
  mount();

  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));
  await vi.waitFor(() => expect(mocks.windowOpen).toHaveBeenCalled());

  expect(mocks.windowOpen.mock.calls[0][0]).toContain('twitter.com/intent/tweet');
  expect(mocks.download).not.toHaveBeenCalled();
});

/*
 * `share()` consumes transient activation before its promise settles, so a refusal coming back
 * from it leaves nothing to open a window with — the popup blocker takes it and the fallback does
 * nothing at all. Ask for a fresh tap, which arrives with its own activation.
 */
it('asks for another tap when the refusal arrives after the activation is spent', async () => {
  mocks.canShareVideo = true;
  mocks.handoff.mockImplementation(refuses(true));
  mount();

  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));
  await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalled());

  expect(mocks.windowOpen).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
});

it('takes the composer on the next tap after a refusal', async () => {
  mocks.canShareVideo = true;
  mocks.handoff.mockImplementation(refuses(true));
  mount();

  const x = screen.getByRole('button', { name: 'Share on X' });
  fireEvent.click(x);
  await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalled());

  fireEvent.click(x);

  expect(mocks.handoff).toHaveBeenCalledTimes(1);
  expect(mocks.windowOpen.mock.calls[0][0]).toContain('twitter.com/intent/tweet');
});

it('ignores a second tap while the share sheet is open', async () => {
  mocks.canShareVideo = true;
  let settle: (value: string) => void = () => {};
  mocks.handoff.mockReturnValue(new Promise<string>(resolve => (settle = resolve)));
  mount();

  const x = screen.getByRole('button', { name: 'Share on X' });
  fireEvent.click(x);
  fireEvent.click(x);

  expect(mocks.handoff).toHaveBeenCalledTimes(1);
  settle('native_share');
});
