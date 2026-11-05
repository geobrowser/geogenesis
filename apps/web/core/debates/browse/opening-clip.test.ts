import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('debateOpeningFor', () => {
  it('opens every debate on its moment by default', async () => {
    const { debateOpeningFor } = await import('./opening-clip');
    expect(debateOpeningFor('debate-1')).toBe('moment');
  });

  it('switches off for everyone with NEXT_PUBLIC_DEBATE_OPENING_CLIP=0', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEBATE_OPENING_CLIP', '0');
    const { debateOpeningFor } = await import('./opening-clip');
    expect(debateOpeningFor('debate-1')).toBe('title_card');
  });
});

describe('opening clips already seen', () => {
  it('remembers a debate in either id spelling, and survives storage that throws', async () => {
    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
      configurable: true,
    });
    const { hasSeenOpeningClip, markOpeningClipSeen } = await import('./opening-clip');

    expect(hasSeenOpeningClip('01a1a399-b4c6-7bb2-a177-09de97258bb5')).toBe(false);
    markOpeningClipSeen('01a1a399-b4c6-7bb2-a177-09de97258bb5');
    expect(hasSeenOpeningClip('01a1a399b4c67bb2a17709de97258bb5')).toBe(true);

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
      configurable: true,
    });
    expect(() => markOpeningClipSeen('debate-2')).not.toThrow();
    expect(hasSeenOpeningClip('debate-2')).toBe(false);
  });
});
