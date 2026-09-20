import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { featureFlagsStorageKey } from '~/core/state/feature-flags';

import { PlaybackDiagnostics } from './playback-diagnostics';
import { debateCard } from './playback-diagnostics-fixtures';

/*
 * Its own file, and that is the point rather than an accident of organisation.
 *
 * `patchMediaElement` installs once per module instance and never uninstalls, so any earlier test
 * in the same file leaves the prototype already patched — and a test for *when* the patch arrives
 * would then pass without it. Vitest gives each file a fresh module, which is the only thing that
 * makes this assertion mean anything.
 */
vi.mock('~/core/state/feature-flags', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/state/feature-flags')>()),
  usePlaybackDiagnosticsEnabled: () => true,
}));

const originalPlay = HTMLMediaElement.prototype.play;

beforeEach(() => {
  window.innerWidth = 400;
  window.innerHeight = 800;
  // The install reads the persisted flag directly rather than through the hydration-gated hook,
  // because that hook is false for the first commit by design.
  window.localStorage.setItem(featureFlagsStorageKey, JSON.stringify({ playbackDiagnostics: true }));
  HTMLMediaElement.prototype.play = () =>
    Promise.reject(new DOMException('not allowed by the user agent', 'NotAllowedError'));
});

afterEach(() => {
  cleanup();
  HTMLMediaElement.prototype.play = originalPlay;
  window.localStorage.removeItem(featureFlagsStorageKey);
  document.querySelectorAll('[data-debate-ready], video').forEach(node => node.remove());
});

describe('PlaybackDiagnostics — the trace is installed before the effects it observes', () => {
  /**
   * The probe has to be in place before the playback it watches, or it reports a negative that
   * cannot be told apart from a real one.
   *
   * `usePlaybackDiagnosticsEnabled` is hydration-gated and returns `false` for the first commit by
   * design, so patching on it left the trace to a passive effect racing `DebateFeedPlayer`'s own.
   * Lose that race and the readout says `calls=[]` — which does not mean "not recorded", it means
   * "nothing ever asked this to play": a different fault, in a different part of the code, and
   * exactly the wrong signpost this file exists to remove.
   *
   * A sibling's passive effect stands in for the card's, mounted *ahead* of the diagnostic so that
   * a passive install loses. Layout effects run during commit, before every passive effect in the
   * tree, which is what makes the ordering a guarantee rather than a race this usually wins.
   */
  it('records a play() from a passive effect that mounts ahead of it', async () => {
    const { card, video } = debateCard({ playing: false, blocked: false });
    document.body.append(card);

    function PlaysOnMount() {
      React.useEffect(() => {
        void video.play().catch(() => {});
      }, []);
      return null;
    }

    render(
      <>
        <PlaysOnMount />
        <PlaybackDiagnostics />
      </>
    );

    await waitFor(() => expect(screen.getByText(/calls=\[play REJECTED:NotAllowedError/)).toBeInTheDocument(), {
      timeout: 3_000,
    });
  });
});
