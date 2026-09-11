import { describe, expect, it } from 'vitest';

import { firstSearchParamValue } from './search-params';

describe('firstSearchParamValue', () => {
  it('passes a single value through', () => {
    expect(firstSearchParamValue('tab-1')).toBe('tab-1');
  });

  it('reads a repeated parameter as its first value, like useSearchParams().get()', () => {
    // The case that regressed: `typeof value === 'string' ? value : undefined` turns this into
    // "absent", so the server read `?tabId=a&tabId=b` as Overview and opened the rail while the
    // client, reading the same URL, rendered the tab.
    expect(firstSearchParamValue(['tab-1', 'tab-2'])).toBe('tab-1');
  });

  it('is undefined when the parameter is absent', () => {
    expect(firstSearchParamValue(undefined)).toBeUndefined();
  });

  it('is undefined for a repeated parameter with no values', () => {
    // Not reachable from a URL, but the type allows it and `[][0]` is where a naive first-value
    // read would hand back `undefined` as a string.
    expect(firstSearchParamValue([])).toBeUndefined();
  });

  it('keeps an empty value falsy, so `!tabId` still means Overview', () => {
    // `?tabId=` names no tab. The page's gate is a truthiness check, so this has to stay empty
    // rather than becoming a tab id nothing matches.
    expect(firstSearchParamValue('')).toBe('');
  });
});
