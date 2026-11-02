import { vi } from 'vitest';

import type { PanelListFilters } from './hub-filters';

/**
 * The Filters bar a panel tab hands its list, for tests (GEO-3463): Best as the only Sort, no
 * switches, and whatever the case overrides — its client sort, its graph order, its predicate.
 */
export function panelFilters(overrides: Partial<PanelListFilters> = {}): PanelListFilters {
  return {
    sort: { options: [{ value: 'best', label: 'Best' }], value: overrides.clientSort ?? 'best', onChange: vi.fn() },
    toggles: [],
    ...overrides,
  };
}
