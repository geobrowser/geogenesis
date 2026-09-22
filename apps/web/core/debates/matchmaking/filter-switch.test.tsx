import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilterSwitch } from './filter-switch';

afterEach(cleanup);

describe('FilterSwitch analytics', () => {
  it('uses the stable setting name instead of state-dependent text', () => {
    render(<FilterSwitch analyticsSurface="hub" label="Matches only" checked={false} onChange={vi.fn()} />);

    expect(screen.getByRole('switch', { name: 'Matches only' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate hub Matches only'
    );
    expect(screen.getByRole('switch', { name: 'Matches only' })).toHaveAttribute(
      'data-geo-analytics-intent',
      'filter_debates_hub'
    );
  });

  it('attributes the shared switch to rematch when that surface owns it', () => {
    render(<FilterSwitch analyticsSurface="rematch" label="Matches only" checked={false} onChange={vi.fn()} />);

    const toggle = screen.getByRole('switch', { name: 'Matches only' });
    expect(toggle).toHaveAttribute('data-geo-analytics-label', 'Debate rematch Matches only');
    expect(toggle).toHaveAttribute('data-geo-analytics-intent', 'filter_debate_rematch');
  });
});
