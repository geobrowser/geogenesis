import { describe, expect, it } from 'vitest';

import { isRenderableImageSrc } from './utils';

describe('isRenderableImageSrc', () => {
  it('accepts the forms an image value legitimately takes', () => {
    // `ipfs:` is checked before `getImagePath` resolves it to a gateway, so it has to pass raw.
    for (const src of [
      'ipfs://QmAbc',
      'https://cdn.example.com/a.png',
      'http://cdn.example.com/a.png',
      '/static/a.png',
      'data:image/png;base64,AAAA',
    ]) {
      expect(isRenderableImageSrc(src), src).toBe(true);
    }
  });

  it('rejects schemes that parse but cannot render', () => {
    // Copilot caught these on PR #2333: `new URL` is a syntax check, so every one of them used to
    // pass. In the share-image chain the first accepted candidate wins, so any of these typed into
    // OG Image would shadow a cover that works — and `file:` is one we would rather never hand to a
    // server-side fetch at all.
    for (const src of [
      'mailto:user@example.com',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'blob:https://example.com/1234',
      'data:text/html,<script>alert(1)</script>',
    ]) {
      expect(isRenderableImageSrc(src), src).toBe(false);
    }
  });

  it('rejects free text that is not a URL at all', () => {
    for (const src of ['hello', 'not a url', 'www.example.com/x.png', '']) {
      expect(isRenderableImageSrc(src), src).toBe(false);
    }
  });

  it('still accepts a protocol-relative URL, as it did before the scheme check', () => {
    // Caught by this suite: `//host/path` starts with `/`, so it takes the root-relative path out
    // and never reaches the allowlist. That is browser-correct — it inherits the page scheme — and
    // is how this behaved before, so it is recorded rather than changed. Worth knowing that it is
    // browser-correct only: a server-side fetch has no page scheme to inherit.
    expect(isRenderableImageSrc('//cdn.example.com/a.png')).toBe(true);
  });
});
