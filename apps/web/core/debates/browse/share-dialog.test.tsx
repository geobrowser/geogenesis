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
  coarsePointer: true,
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
  downloadPreparedVideo: mocks.download,
  handoffPreparedSocialVideo: mocks.handoff,
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
  return render(
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
  // jsdom has no Web Share API; the dialog probes it for real, so give it one to answer.
  Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => mocks.canShareVideo });
  mocks.coarsePointer = true;
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: query.includes('coarse') ? mocks.coarsePointer : false }) as MediaQueryList
  );
});
afterEach(() => {
  delete (navigator as { share?: unknown }).share;
  delete (navigator as { canShare?: unknown }).canShare;
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
 * The X tile is always the link composer, and the video is its own tile: on a phone, one X tile
 * opened either the composer or the system share sheet (every app, not just X) depending on whether
 * the video had finished downloading, and nobody could tell which they would get.
 */
it('keeps X as the link composer even where the device can share the video', () => {
  mocks.canShareVideo = true;
  mount();

  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));

  expect(mocks.windowOpen.mock.calls[0][0]).toContain('twitter.com/intent/tweet');
  expect(mocks.handoff).not.toHaveBeenCalled();
});

it.each([
  [true, 'Share debate video', 'Share video'],
  [false, 'Download debate video', 'Download'],
])('names the video tile for what it will do when canShare is %s', (canShare, ariaLabel, label) => {
  mocks.canShareVideo = canShare;
  mount();

  expect(screen.getByRole('button', { name: ariaLabel })).toBeTruthy();
  expect(screen.getByText(label)).toBeTruthy();
});

it('downloads the video on a desktop pointer, even where canShare accepts the file', () => {
  mocks.canShareVideo = true;
  mocks.coarsePointer = false;
  mount();

  expect(screen.getByText('Download')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Download debate video' }));
  fireEvent.click(screen.getByRole('button', { name: 'With captions' }));

  expect(mocks.handoff).not.toHaveBeenCalled();
  expect(mocks.download).toHaveBeenCalledTimes(1);
});

const shareVideo = (captions = 'With captions') => {
  fireEvent.click(screen.getByRole('button', { name: 'Share debate video' }));
  fireEvent.click(screen.getByRole('button', { name: captions }));
};

it('hands the chosen video to the share sheet with a link tagged as a native share', async () => {
  mocks.canShareVideo = true;
  mount(realDebate);
  shareVideo();
  expect(screen.getByRole('heading', { name: 'Share video' })).toBeTruthy();
  await waitFor(() => expect(handoffs()).toHaveLength(1));

  const shared = mocks.handoff.mock.calls[0][0];
  expect(shared).toMatchObject({ debateId: realDebate.id, file: { name: 'captioned.mp4' }, captions: 'captioned' });
  expect(shared).not.toHaveProperty('onUnshareable');
  expect(shared.text).toMatch(/^Private claim text\. Watch the debate on Geo! /);
  const destination = new URL(shared.text.split(' ').at(-1));
  expect(parseShareLink(destination.searchParams)).toMatchObject({ method: 'native_share' });
  expect(handoffs()[0][1]).toMatchObject({
    ...parseShareLink(destination.searchParams),
    handoff_kind: 'composer_requested',
  });
  expect(mocks.capture).toHaveBeenCalledWith(
    'debate_share_action',
    expect.objectContaining({ method: 'native_share', captions: true })
  );
  expect((window as Window & { dataLayer?: Record<string, unknown>[] }).dataLayer).toContainEqual(
    expect.objectContaining({ event: 'geo_share', share_method: 'native_share' })
  );
  expect(mocks.download).not.toHaveBeenCalled();
});

it('asks for another tap when the video finishes preparing after the choice', () => {
  mocks.canShareVideo = true;
  mocks.status = 'preparing';
  const view = mount();
  shareVideo();
  expect(screen.getByText(/Preparing…/)).toBeTruthy();

  mocks.status = 'ready';
  view.rerender(
    <DebateShareDialog
      open
      onOpenChange={vi.fn()}
      debate={debate}
      spaceId="space"
      openerRef={React.createRef<HTMLButtonElement>()}
    />
  );

  expect(screen.getByText('Ready. Tap to share.')).toBeTruthy();
  expect(mocks.handoff).not.toHaveBeenCalled();
});

it('retries a video that failed to prepare instead of sharing it', () => {
  mocks.canShareVideo = true;
  mocks.status = 'error';
  mount();
  shareVideo();

  expect(mocks.retry).toHaveBeenCalledTimes(1);
  expect(mocks.handoff).not.toHaveBeenCalled();
});

it('records nothing when the share sheet is closed', async () => {
  mocks.canShareVideo = true;
  mocks.handoff.mockRejectedValue(new DOMException('Share canceled', 'AbortError'));
  mount(realDebate);
  shareVideo();
  await waitFor(() => expect(mocks.handoff).toHaveBeenCalled());
  await Promise.resolve();

  expect(handoffs()).toHaveLength(0);
  expect(mocks.capture).not.toHaveBeenCalledWith('debate_share_action', expect.anything());
  expect(mocks.toast).not.toHaveBeenCalled();
});

// `handoffPreparedSocialVideo` downloads the file itself when the browser refuses the share.
it('records a refused share that fell back to a download as a download, not a link handoff', async () => {
  mocks.canShareVideo = true;
  mocks.handoff.mockResolvedValue('download');
  mount(realDebate);
  shareVideo();
  await waitFor(() =>
    expect(mocks.capture).toHaveBeenCalledWith('debate_share_action', expect.objectContaining({ method: 'download' }))
  );

  expect(handoffs()).toHaveLength(0);
});

it('ignores a second choice while the share sheet is open', () => {
  mocks.canShareVideo = true;
  mocks.handoff.mockReturnValue(new Promise(() => {}));
  mount();
  shareVideo();
  fireEvent.click(screen.getByRole('button', { name: 'With captions' }));

  expect(mocks.handoff).toHaveBeenCalledTimes(1);
});
