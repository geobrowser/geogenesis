import { renderToStaticMarkup } from 'react-dom/server';

import { describe, expect, it, vi } from 'vitest';

import { RankingHeaderActions } from './ranking-header-actions';
import type { RankingBlockState } from './use-ranking-block-state';

function state(hasMySubmission: boolean): RankingBlockState {
  return {
    periodState: 'in-progress',
    periodLabel: null,
    hasMySubmission,
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
    expect(markup).not.toContain('<svg');
  });

  it('renders the icon-free Figma Rank button when the viewer can rank', () => {
    const markup = renderToStaticMarkup(<RankingHeaderActions state={state(false)} />);

    expect(markup).toContain('Rank');
    expect(markup).not.toContain('Vote');
    expect(markup).toContain('!bg-[#151515]');
    expect(markup).not.toContain('<svg');
  });
});
