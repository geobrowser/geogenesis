import { describe, expect, it } from 'vitest';

import * as debateApi from './api';
import * as debateHooks from './hooks';

describe('response-derived debate contract', () => {
  it('does not expose deprecated position-update endpoints or hooks', () => {
    expect(debateApi).not.toHaveProperty('updateDebatePreference');
    expect(debateApi).not.toHaveProperty('updateDebateRematchPosition');
    expect(debateHooks).not.toHaveProperty('useUpdateDebatePreference');
    expect(debateHooks).not.toHaveProperty('useUpdateDebateRematchPosition');
  });
});
