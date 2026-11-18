import { describe, expect, it } from 'vitest';

import {
  geoCallPageCallId,
  isSpaceCallPath,
  spaceCallPath,
  spaceCallScheduleNewPath,
  spaceCallSeriesEditPath,
  spaceCallsTabPath,
} from './routes';

describe('space call routes', () => {
  it('builds and recognises a call path', () => {
    expect(spaceCallPath('space1', 'call1')).toBe('/space/space1/calls/call1');
    expect(isSpaceCallPath('/space/space1/calls/call1?via=x')).toBe(true);
    // The space's calls list (GEO-3420) is not a call.
    expect(isSpaceCallPath(spaceCallsTabPath('space1'))).toBe(false);
    expect(isSpaceCallPath('/debate/call1')).toBe(false);
    expect(spaceCallScheduleNewPath('space1')).toBe('/space/space1/community/new');
    expect(spaceCallSeriesEditPath('space1', 'series1')).toBe('/space/space1/community/series1/edit');
  });
});

describe('geoCallPageCallId', () => {
  const call = '0d9c5b2e7a114f3c9e2d8b6a4f1c3e70';
  const space = 'c9f267dcb0d270718c2a3c45a64afd32';

  it('reads the call id off a call page URL on any host and spelling', () => {
    expect(geoCallPageCallId(`https://www.geobrowser.io/space/${space}/calls/${call}`)).toBe(call);
    expect(geoCallPageCallId(`http://localhost:3000/space/${space}/calls/0D9C5B2E-7A11-4F3C-9E2D-8B6A4F1C3E70/`)).toBe(
      call
    );
  });

  it('is null for anything else', () => {
    for (const url of [
      null,
      '',
      `/space/${space}/calls/${call}`,
      `ipfs://bafy/space/${space}/calls/${call}`,
      `https://www.geobrowser.io/space/${space}/calls`,
      `https://www.geobrowser.io/space/${space}/calls/${call}/chat`,
      `https://www.geobrowser.io/space/${space}/${call}`,
      'https://cdn.example.com/video.mp4',
      'not a url',
    ]) {
      expect(geoCallPageCallId(url)).toBeNull();
    }
  });
});
