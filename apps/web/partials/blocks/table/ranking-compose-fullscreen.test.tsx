import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RankingComposeFullscreen } from './ranking-compose-fullscreen';
import { rankingFullscreenFocusTargetAtom } from '~/atoms';

vi.mock('~/core/hooks/use-is-mobile-layout', () => ({ useIsMobileLayout: () => false }));

describe('RankingComposeFullscreen', () => {
  afterEach(cleanup);

  it('publishes a focusable surface while mounted and clears it on unmount', () => {
    const store = createStore();
    const { unmount } = render(
      <Provider store={store}>
        <RankingComposeFullscreen>
          <span>Ranking content</span>
        </RankingComposeFullscreen>
      </Provider>
    );

    const fullscreen = screen.getByRole('region', { name: 'Ranking' });
    expect(fullscreen).toHaveAttribute('tabindex', '-1');
    expect(store.get(rankingFullscreenFocusTargetAtom)).toBe(fullscreen);

    unmount();
    expect(store.get(rankingFullscreenFocusTargetAtom)).toBeNull();
  });
});
