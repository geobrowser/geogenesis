import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RankingHeaderActions } from './ranking-header-actions';
import type { RankingBlockState } from './use-ranking-block-state';

function state(
  hasMySubmission: boolean,
  isRollingRolledOff = false,
  ballotReadError: string | null = null
): RankingBlockState {
  return {
    ballotReadError,
    retryBallotRead: vi.fn(async () => ({})),
    periodState: 'in-progress',
    periodLabel: null,
    hasMySubmission,
    isRollingRolledOff,
    isSaving: false,
    openRankingCompose: vi.fn(),
  } as unknown as RankingBlockState;
}

describe('RankingHeaderActions', () => {
  it('renders the icon-free Figma View button for an existing ranking', () => {
    const markup = renderToStaticMarkup(<RankingHeaderActions state={state(true)} />);

    expect(markup).toContain('View');
    expect(markup).toContain('h-7');
    expect(markup).toContain('!border-grey-02');
    expect(markup).toContain('focus-visible:!border-text');
    expect(markup).toContain('focus-visible:!shadow-inner-text');
    expect(markup).not.toContain('<svg');
  });

  it('renders the icon-free Figma Rank button when the viewer can rank', () => {
    const markup = renderToStaticMarkup(<RankingHeaderActions state={state(false)} />);

    expect(markup).toContain('Rank');
    expect(markup).not.toContain('Vote');
    expect(markup).toContain('!bg-[#151515]');
    expect(markup).toContain('focus-visible:!border-text');
    expect(markup).toContain('focus-visible:!shadow-inner-text');
    expect(markup).not.toContain('<svg');
  });

  it('returns to the Rank button when a rolling submission has rolled off', () => {
    const markup = renderToStaticMarkup(<RankingHeaderActions state={state(true, true)} />);

    expect(markup).toContain('Rank');
    expect(markup).not.toContain('View');
    expect(markup).toContain('!bg-[#151515]');
  });

  it('shows that the ballot could not be read instead of offering a fresh ranking', () => {
    const markup = renderToStaticMarkup(<RankingHeaderActions state={state(false, false, 'Could not load it.')} />);

    expect(markup).toContain('Couldn&#x27;t load your ranking');
    expect(markup).toContain('Try again');
    expect(markup).not.toContain('Rank<');
  });
});
