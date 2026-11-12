import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { buildMyRankingActionButton } from './ranking-block-body';
import type { RankingBlockState } from './use-ranking-block-state';

function state(ballotReadError: string | null): RankingBlockState {
  return {
    ballotReadError,
    retryBallotRead: vi.fn(async () => ({})),
    showEditRankingButton: false,
    isSaving: false,
    openRankingCompose: vi.fn(),
  } as unknown as RankingBlockState;
}

describe('my ranking action when the ballot cannot be read (GEO-3680)', () => {
  it('shows the read error instead of "Add my ranking"', () => {
    const markup = renderToStaticMarkup(<>{buildMyRankingActionButton(state('Reload the page and try again.'))}</>);

    expect(markup).toContain('Reload the page and try again.');
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain('Add my ranking');
  });

  it('offers "Add my ranking" when there is no read error and no ballot', () => {
    const markup = renderToStaticMarkup(<>{buildMyRankingActionButton(state(null))}</>);

    expect(markup).toContain('Add my ranking');
  });
});
