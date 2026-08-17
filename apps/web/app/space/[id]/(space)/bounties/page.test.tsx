import { describe, expect, it, vi } from 'vitest';

import SpaceBountiesPage from './page';

const mocks = vi.hoisted(() => ({
  isValid: vi.fn(),
  enabled: true,
  isBountySpace: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
}));

vi.mock('@geoprotocol/geo-sdk/lite', () => ({
  IdUtils: { isValid: mocks.isValid },
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('~/core/bounties/config', () => ({
  get bountiesEnabledForNetwork() {
    return mocks.enabled;
  },
}));
vi.mock('~/core/bounties/constants', () => ({
  isBountySpace: (id: string) => mocks.isBountySpace(id),
}));
vi.mock('./space-bounties-page-client', () => ({
  SpaceBountiesPageClient: ({ spaceId }: { spaceId: string }) => <div data-space-id={spaceId} />,
}));

describe('SpaceBountiesPage', () => {
  it('rejects an invalid space ID', async () => {
    mocks.isValid.mockReturnValue(false);
    await expect(SpaceBountiesPage({ params: Promise.resolve({ id: 'invalid' }) })).rejects.toThrow('not found');
  });

  it('404s when the network gate is off or the space is not in the program', async () => {
    mocks.isValid.mockReturnValue(true);
    mocks.enabled = false;
    mocks.isBountySpace.mockReturnValue(true);
    await expect(SpaceBountiesPage({ params: Promise.resolve({ id: 'space-1' }) })).rejects.toThrow('not found');

    mocks.enabled = true;
    mocks.isBountySpace.mockReturnValue(false);
    await expect(SpaceBountiesPage({ params: Promise.resolve({ id: 'space-1' }) })).rejects.toThrow('not found');
  });

  it('renders the client page for a participating space', async () => {
    mocks.isValid.mockReturnValue(true);
    mocks.enabled = true;
    mocks.isBountySpace.mockReturnValue(true);
    const element = await SpaceBountiesPage({ params: Promise.resolve({ id: 'space-1' }) });
    expect(element.props.spaceId).toBe('space-1');
  });
});
