import { describe, expect, it } from 'vitest';

import { isUrlTemplate, resolveUrlTemplate } from './url-template';

describe('url-template', () => {
  it('accepts valid http/https templates with a single placeholder', () => {
    expect(isUrlTemplate('https://x.com/{value}')).toBe(true);
    expect(isUrlTemplate('http://example.com/path/{value}?q=1')).toBe(true);
    expect(isUrlTemplate('https://example.com/profile#{value}')).toBe(true);
  });

  it('rejects templates without a scheme', () => {
    expect(isUrlTemplate('x.com/{value}')).toBe(false);
  });

  it('rejects templates with multiple placeholders', () => {
    expect(isUrlTemplate('https://x.com/{value}/{value}')).toBe(false);
  });

  it('rejects templates with placeholder in scheme or host', () => {
    expect(isUrlTemplate('{value}://x.com/path')).toBe(false);
    expect(isUrlTemplate('https://{value}.com/path')).toBe(false);
    expect(isUrlTemplate('https://x.{value}.com/path')).toBe(false);
  });

  it('resolves valid templates and falls back on invalid ones', () => {
    expect(resolveUrlTemplate('https://x.com/{value}', 'Vitalik')).toBe('https://x.com/Vitalik');
    expect(resolveUrlTemplate('https://x.com/{value}', '')).toBe('https://x.com/');
    expect(resolveUrlTemplate('https://x.com/{value}', 'foo bar')).toBe('https://x.com/foo bar');
    expect(resolveUrlTemplate(null, 'foo')).toBe('foo');
    expect(resolveUrlTemplate(undefined, 'bar')).toBe('bar');
    expect(resolveUrlTemplate('x.com/{value}', 'Vitalik')).toBe('Vitalik');
  });
});
