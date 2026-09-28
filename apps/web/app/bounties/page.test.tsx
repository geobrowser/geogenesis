import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: true,
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('~/core/bounties/config', () => ({
  get bountiesEnabledForNetwork() {
    return mocks.enabled;
  },
}));
vi.mock('./bounties-page-client', () => ({
  BountiesPageClient: () => <div data-testid="client" />,
}));

describe('BountiesPage', () => {
  it('404s when the network gate is off (mainnet or no curator backend)', async () => {
    mocks.enabled = false;
    const { default: BountiesPage } = await import('./page');
    expect(() => BountiesPage()).toThrow('not found');
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it('renders the client page when the gate is on', async () => {
    mocks.enabled = true;
    const { default: BountiesPage } = await import('./page');
    expect(BountiesPage()).toBeTruthy();
  });
});
