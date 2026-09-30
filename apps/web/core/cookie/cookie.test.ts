import { beforeEach, describe, expect, it, vi } from 'vitest';

import { onConnectionChange } from './cookie';
import { WALLET_ADDRESS } from './index';

const store = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    get: vi.fn((name: string) => (values.has(name) ? { name, value: values.get(name)! } : undefined)),
    has: vi.fn((name: string) => values.has(name)),
    set: vi.fn((name: string, value: string) => void values.set(name, value)),
    delete: vi.fn((name: string) => void values.delete(name)),
  };
});

vi.mock('next/headers', () => ({ cookies: async () => store }));

const ADDRESS = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

describe('onConnectionChange', () => {
  beforeEach(() => {
    store.values.clear();
    vi.clearAllMocks();
  });

  // Any cookie write in a Server Action makes Next re-render the page, and after a deploy that is
  // a full reload — so a repeat connect for the same wallet must not write.
  it('does not rewrite the cookie when it already holds the address', async () => {
    store.values.set(WALLET_ADDRESS, ADDRESS);

    await expect(onConnectionChange({ type: 'connect', address: ADDRESS })).resolves.toBe(ADDRESS);

    expect(store.set).not.toHaveBeenCalled();
  });

  it('writes the cookie when it is missing', async () => {
    await onConnectionChange({ type: 'connect', address: ADDRESS });

    expect(store.set).toHaveBeenCalledWith(WALLET_ADDRESS, ADDRESS, expect.objectContaining({ httpOnly: true }));
  });

  it('writes the cookie when it holds a different address', async () => {
    store.values.set(WALLET_ADDRESS, OTHER);

    await onConnectionChange({ type: 'connect', address: ADDRESS });

    expect(store.set).toHaveBeenCalledWith(WALLET_ADDRESS, ADDRESS, expect.anything());
  });

  it('deletes the cookie on disconnect, and skips the write when there is none', async () => {
    store.values.set(WALLET_ADDRESS, ADDRESS);
    await expect(onConnectionChange({ type: 'disconnect' })).resolves.toBeNull();
    expect(store.delete).toHaveBeenCalledTimes(1);

    await onConnectionChange({ type: 'disconnect' });
    expect(store.delete).toHaveBeenCalledTimes(1);
  });
});
