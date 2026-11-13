import { describe, expect, it, vi } from 'vitest';

import { claimPlayback, joinPlaybackGroup } from './exclusive-playback';

describe('exclusive playback', () => {
  it('pauses every other member of the group when one starts, and nobody outside it', () => {
    const a = { pause: vi.fn() };
    const b = { pause: vi.fn() };
    const elsewhere = { pause: vi.fn() };
    const leaveA = joinPlaybackGroup('compare', a);
    const leaveB = joinPlaybackGroup('compare', b);
    const leaveElsewhere = joinPlaybackGroup('other', elsewhere);

    claimPlayback('compare', a);
    expect(a.pause).not.toHaveBeenCalled();
    expect(b.pause).toHaveBeenCalledTimes(1);
    expect(elsewhere.pause).not.toHaveBeenCalled();

    claimPlayback('compare', b);
    expect(a.pause).toHaveBeenCalledTimes(1);

    leaveA();
    claimPlayback('compare', b);
    expect(a.pause).toHaveBeenCalledTimes(1);
    leaveB();
    leaveElsewhere();
  });
});
