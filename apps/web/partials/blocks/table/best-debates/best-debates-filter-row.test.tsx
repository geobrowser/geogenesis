import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { NO_RANKING_FILTERS, type RankingFilters } from '~/core/blocks/ranking/best-debates-ranking-filters';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { BestDebatesFilterRow, recordedMenuValue } from './best-debates-filter-row';
import { filterFacetPopulation } from './use-best-debates-filter-facets';

afterEach(cleanup);

// The menus measure their list for the search field.
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const TODAY = '2026-11-16';
const ANA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BEN = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CLAIM = 'cccccccccccccccccccccccccccccccc';

const facets = {
  pending: false,
  debaters: [
    { id: ANA, name: 'Ana Lopez', count: 4 },
    { id: BEN, name: 'Ben Tran', count: 2 },
  ],
  claims: [{ id: CLAIM, name: 'Remote work is better', count: 3 }],
};

function renderRow(filters: RankingFilters = NO_RANKING_FILTERS, topicsPicked = false) {
  const setFilters = vi.fn();
  const onClearTopics = vi.fn();
  render(
    <BestDebatesFilterRow
      state={{ filters, setFilters }}
      facets={facets}
      todayKey={TODAY}
      topicsPicked={topicsPicked}
      onClearTopics={onClearTopics}
    />
  );
  return { setFilters, onClearTopics };
}

describe('BestDebatesFilterRow', () => {
  it('picks a strip day, This week, or any time from the Recorded menu', () => {
    const { setFilters } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Recorded' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
    expect(setFilters).toHaveBeenLastCalledWith(
      { ...NO_RANKING_FILTERS, recorded: { kind: 'day', dayKey: '2026-11-15' } },
      'recorded_filter'
    );
  });

  it('opens two date fields for Custom dates, and writes a range once both ends are set', () => {
    const { setFilters } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Recorded' }));
    fireEvent.click(screen.getByRole('button', { name: 'Custom dates…' }));
    expect(setFilters).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-09' } });
    expect(setFilters).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-01' } });
    expect(setFilters).toHaveBeenLastCalledWith(
      { ...NO_RANKING_FILTERS, recorded: { kind: 'range', fromKey: '2026-10-01', toKey: '2026-10-09' } },
      'recorded_filter'
    );
  });

  it('shows an older day or a range as Custom dates with its fields filled', () => {
    renderRow({ ...NO_RANKING_FILTERS, recorded: { kind: 'day', dayKey: '2026-10-02' } });
    expect(screen.getByLabelText('From')).toHaveValue('2026-10-02');
    expect(screen.getByLabelText('To')).toHaveValue('2026-10-02');
    expect(recordedMenuValue({ kind: 'day', dayKey: '2026-11-14' }, TODAY)).toBe('2026-11-14');
    expect(recordedMenuValue({ kind: 'range', fromKey: '2026-11-14', toKey: '2026-11-15' }, TODAY)).toBe('custom');
  });

  it('adds debaters to an OR filter, and replaces the one claim', () => {
    const { setFilters } = renderRow({ ...NO_RANKING_FILTERS, debaterIds: [ANA] });
    fireEvent.click(screen.getByRole('button', { name: /Ana Lopez/ }));
    fireEvent.click(screen.getByText('Ben Tran').closest('button')!);
    expect(setFilters).toHaveBeenLastCalledWith({ ...NO_RANKING_FILTERS, debaterIds: [ANA, BEN] }, 'debater_filter');
    cleanup();

    const claim = renderRow({ ...NO_RANKING_FILTERS, claimId: 'dddddddddddddddddddddddddddddddd' });
    fireEvent.click(screen.getByRole('button', { name: /1 claim/ }));
    fireEvent.click(screen.getByText('Remote work is better').closest('button')!);
    expect(claim.setFilters).toHaveBeenLastCalledWith({ ...NO_RANKING_FILTERS, claimId: CLAIM }, 'claim_filter');
  });

  it('clears every filter and the topics with Clear filters', () => {
    const { setFilters, onClearTopics } = renderRow({ ...NO_RANKING_FILTERS, claimId: CLAIM }, true);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(setFilters).toHaveBeenCalledWith(NO_RANKING_FILTERS, 'clear_filters');
    expect(onClearTopics).toHaveBeenCalled();
  });

  it('shows no Clear filters when nothing is on', () => {
    renderRow();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });
});

describe('filterFacetPopulation', () => {
  it('counts Debates only, under every other filter, leaving out what To rank leaves out', () => {
    const population = filterFacetPopulation({
      query: 'remote',
      topicIds: [],
      filters: { recorded: null, debaterIds: [ANA], claimId: CLAIM },
      window: { fromMs: 1000, toMs: 2000 },
      omit: 'debaters',
      excludeEntityIds: [BEN],
    });
    const text = JSON.stringify(population);
    expect(text).toContain(DEBATE_TYPE_ID);
    expect(text).toContain(CLAIM);
    expect(text).not.toContain(ANA);
    expect(population.and).toContainEqual({ id: { notIn: [BEN] } });
    expect(population.and).toContainEqual({ name: { includesInsensitive: 'remote' } });
  });
});
