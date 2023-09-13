import { describe, expect, it } from 'vitest';

import { getEnv } from './cookie';

describe('Cookie', () => {
  it('Parses a valid AppEnv', () => {
    const env = getEnv('https://banana.com/?env=development');
    expect(env).toBe('development');
  });

  it('Parses the env even if it is not a valid AppEnv', () => {
    const env = getEnv('https://banana.com/?env=banana');
    expect(env).toBe('banana');
  });

  it('Parses null if the env is not set in the url', () => {
    const env = getEnv('https://banana.com/');
    expect(env).toBe(null);
  });
});
