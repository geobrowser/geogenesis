import { describe, expect, it } from 'vitest';

import { isSpaceCallPath, spaceCallPath } from './routes';

describe('space call routes', () => {
  it('builds and recognises a call path', () => {
    expect(spaceCallPath('space1', 'call1')).toBe('/space/space1/calls/call1');
    expect(isSpaceCallPath('/space/space1/calls/call1?via=x')).toBe(true);
    // The space's calls list (GEO-3420) is not a call.
    expect(isSpaceCallPath('/space/space1/calls')).toBe(false);
    expect(isSpaceCallPath('/debate/call1')).toBe(false);
  });
});
