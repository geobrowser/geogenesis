import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isValid: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
}));

vi.mock('@geoprotocol/geo-sdk/lite', () => ({
  IdUtils: { isValid: mocks.isValid },
}));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));

vi.mock('./debug-debates-page-client', () => ({
  DebugDebatesPageClient: ({ spaceId }: { spaceId: string }) => <div data-space-id={spaceId} />,
}));

import DebugDebatesPage from './page';

describe('DebugDebatesPage', () => {
  it('rejects an invalid space ID', async () => {
    mocks.isValid.mockReturnValue(false);

    await expect(DebugDebatesPage({ params: Promise.resolve({ id: 'invalid' }) })).rejects.toThrow('not found');
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it('passes a valid space ID to the client page', async () => {
    mocks.isValid.mockReturnValue(true);

    const result = await DebugDebatesPage({ params: Promise.resolve({ id: 'valid-space-id' }) });

    expect(result.props.spaceId).toBe('valid-space-id');
  });
});
