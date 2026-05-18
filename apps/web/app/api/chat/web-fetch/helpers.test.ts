import { describe, expect, it } from 'vitest';

import { type FxTweet, isPrivateHost, stripHtml, summarizeFxTweet, validateUrl } from './helpers';

describe('isPrivateHost', () => {
  it.each([
    ['localhost'],
    ['app.localhost'],
    ['127.0.0.1'],
    ['127.255.255.255'],
    ['0.0.0.0'],
    ['10.0.0.1'],
    ['10.255.255.255'],
    ['192.168.0.1'],
    ['192.168.255.255'],
    ['172.16.0.1'],
    ['172.31.255.255'],
    ['169.254.169.254'],
    ['::1'],
    ['[::1]'],
    ['::'],
    ['[::]'],
    ['fc00::1'],
    ['fd12::abcd'],
    ['fe80::1'],
    ['FE80::1'],
    ['0:0:0:0:0:0:0:1'],
    ['[0:0:0:0:0:0:0:1]'],
    ['0:0:0:0:0:0:0:0'],
    ['::ffff:127.0.0.1'],
    ['[::ffff:127.0.0.1]'],
    ['::ffff:10.0.0.1'],
    ['::ffff:7f00:1'],
    ['::FFFF:C0A8:0001'],
    ['2002:7f00:0001::'],
    ['2002:c0a8:0001::'],
  ])('blocks %s', host => {
    expect(isPrivateHost(host)).toBe(true);
  });

  it.each([
    ['example.com'],
    ['api.fxtwitter.com'],
    ['x.com'],
    ['8.8.8.8'],
    ['172.15.0.1'],
    ['172.32.0.1'],
    ['11.0.0.1'],
    ['192.169.0.1'],
    ['2606:4700:4700::1111'],
    ['::ffff:8.8.8.8'],
    ['2002:0808:0808::'],
  ])('allows %s', host => {
    expect(isPrivateHost(host)).toBe(false);
  });
});

describe('validateUrl', () => {
  it('rejects non-strings', () => {
    expect(validateUrl(null)).toBeNull();
    expect(validateUrl(undefined)).toBeNull();
    expect(validateUrl(42)).toBeNull();
    expect(validateUrl({})).toBeNull();
  });

  it('rejects empty and whitespace-only input', () => {
    expect(validateUrl('')).toBeNull();
    expect(validateUrl('   ')).toBeNull();
  });

  it('rejects URLs over the length cap', () => {
    const huge = 'https://example.com/' + 'a'.repeat(2_001);
    expect(validateUrl(huge)).toBeNull();
  });

  it('rejects unparseable input', () => {
    expect(validateUrl('not a url')).toBeNull();
    expect(validateUrl('://broken')).toBeNull();
  });

  it('rejects non-http(s) protocols', () => {
    expect(validateUrl('ftp://example.com/file')).toBeNull();
    expect(validateUrl('file:///etc/passwd')).toBeNull();
    expect(validateUrl('javascript:alert(1)')).toBeNull();
    expect(validateUrl('data:text/plain,hi')).toBeNull();
  });

  it('rejects private / loopback hosts (SSRF block)', () => {
    expect(validateUrl('http://localhost/admin')).toBeNull();
    expect(validateUrl('http://127.0.0.1/')).toBeNull();
    expect(validateUrl('http://10.0.0.5/')).toBeNull();
    expect(validateUrl('http://192.168.1.1/')).toBeNull();
    expect(validateUrl('http://169.254.169.254/latest/meta-data/')).toBeNull();
    expect(validateUrl('http://[::1]/')).toBeNull();
  });

  it('accepts a plain https URL and flags it as non-X', () => {
    const result = validateUrl('https://example.com/article');
    expect(result).not.toBeNull();
    expect(result!.url.href).toBe('https://example.com/article');
    expect(result!.isXPost).toBe(false);
    expect(result!.xPath).toBeNull();
  });

  it('trims surrounding whitespace before parsing', () => {
    const result = validateUrl('   https://example.com/   ');
    expect(result).not.toBeNull();
    expect(result!.url.host).toBe('example.com');
  });

  it('routes x.com /<user>/status/<id> URLs to the FxTwitter path', () => {
    const result = validateUrl('https://x.com/jack/status/20');
    expect(result).not.toBeNull();
    expect(result!.isXPost).toBe(true);
    expect(result!.xPath).toEqual({ user: 'jack', statusId: '20' });
  });

  it('accepts twitter.com, mobile.twitter.com, and www variants', () => {
    for (const host of ['twitter.com', 'mobile.twitter.com', 'www.x.com', 'www.twitter.com']) {
      const result = validateUrl(`https://${host}/elonmusk/status/123456789`);
      expect(result).not.toBeNull();
      expect(result!.isXPost).toBe(true);
      expect(result!.xPath).toEqual({ user: 'elonmusk', statusId: '123456789' });
    }
  });

  it('marks non-status x.com URLs as unfetchable', () => {
    const profile = validateUrl('https://x.com/jack');
    expect(profile).not.toBeNull();
    expect(profile!.isXPost).toBe(true);
    expect(profile!.xPath).toBeNull();

    const search = validateUrl('https://x.com/search?q=hi');
    expect(search!.isXPost).toBe(true);
    expect(search!.xPath).toBeNull();
  });

  it('matches status paths with trailing segments (/photo/1)', () => {
    const result = validateUrl('https://x.com/jack/status/20/photo/1');
    expect(result!.xPath).toEqual({ user: 'jack', statusId: '20' });
  });

  it('rejects status paths with non-numeric ids', () => {
    const result = validateUrl('https://x.com/jack/status/notanid');
    expect(result!.isXPost).toBe(true);
    expect(result!.xPath).toBeNull();
  });

  it('rejects status paths whose handle is malformed (X handles are [A-Za-z0-9_]{1,15})', () => {
    for (const handle of ['user@bad', 'user%20', 'user.dot', 'has-dash', 'sixteen_chars_xx']) {
      const result = validateUrl(`https://x.com/${handle}/status/123`);
      expect(result!.isXPost).toBe(true);
      expect(result!.xPath).toBeNull();
    }
  });

  it('accepts the legal handle edge sizes (1 char and 15 chars)', () => {
    expect(validateUrl('https://x.com/a/status/1')!.xPath).toEqual({ user: 'a', statusId: '1' });
    expect(validateUrl('https://x.com/abcdefghij12345/status/1')!.xPath).toEqual({
      user: 'abcdefghij12345',
      statusId: '1',
    });
  });
});

describe('stripHtml', () => {
  it('strips tags and decodes core entities', () => {
    const input = '<p>hello &amp; goodbye &lt;world&gt;</p>';
    expect(stripHtml(input)).toBe('hello & goodbye <world>');
  });

  it('converts <br> variants to newlines', () => {
    expect(stripHtml('a<br>b<br/>c<BR />d')).toBe('a\nb\nc\nd');
  });

  it('decodes &quot; and &#39;', () => {
    expect(stripHtml('<p>&quot;hi&quot; she said &#39;hello&#39;</p>')).toBe('"hi" she said \'hello\'');
  });

  it('decodes common typographic named entities', () => {
    expect(stripHtml('<p>he said&hellip;</p>')).toBe('he said…');
    expect(stripHtml('<p>1990&ndash;2000 &mdash; an era</p>')).toBe('1990–2000 — an era');
    expect(stripHtml('<p>It&rsquo;s &lsquo;here&rsquo;</p>')).toBe('It’s ‘here’');
    expect(stripHtml('<p>&ldquo;quoted&rdquo;</p>')).toBe('“quoted”');
    expect(stripHtml('<p>&copy; 2026 &reg; &trade;</p>')).toBe('© 2026 ® ™');
  });

  it('replaces &nbsp; with a regular space', () => {
    expect(stripHtml('<p>a&nbsp;b</p>')).toBe('a b');
  });

  it('decodes numeric and hex character references', () => {
    expect(stripHtml('<p>It&#8217;s fine &#x2014; really</p>')).toBe('It’s fine — really');
    expect(stripHtml('<p>&#x2019;&#8216;</p>')).toBe('’‘');
  });

  it('leaves unknown entities intact rather than dropping them', () => {
    expect(stripHtml('<p>&zzz; and &#xZZ;</p>')).toBe('&zzz; and &#xZZ;');
  });

  it('preserves literal entity references when written as &amp;...', () => {
    // Single-pass decode: `&amp;lt;` is the literal "&lt;", not "<".
    expect(stripHtml('<p>&amp;lt;tag&amp;gt;</p>')).toBe('&lt;tag&gt;');
  });

  it('collapses runs of consecutive line breaks to a single newline', () => {
    // /\s+\n/g eats trailing whitespace including the preceding newlines.
    expect(stripHtml('a<br><br><br><br>b')).toBe('a\nb');
  });

  it('trims trailing whitespace before newlines', () => {
    expect(stripHtml('a   <br>b')).toBe('a\nb');
  });

  it('handles a realistic oEmbed blockquote', () => {
    const html =
      '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">just setting up my twttr</p>&mdash; jack (@jack)</blockquote>';
    const out = stripHtml(html);
    expect(out).toContain('just setting up my twttr');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });
});

describe('summarizeFxTweet', () => {
  const baseTweet: FxTweet = {
    text: 'hello world',
    author: { name: 'Jack Dorsey', screen_name: 'jack' },
    created_at: 'Tue Mar 21 20:50:14 +0000 2006',
    url: 'https://x.com/jack/status/20',
  };

  it('returns null when text is missing or empty', () => {
    expect(summarizeFxTweet({ ...baseTweet, text: undefined }, 'https://x.com/x')).toBeNull();
    expect(summarizeFxTweet({ ...baseTweet, text: '' }, 'https://x.com/x')).toBeNull();
    expect(summarizeFxTweet({ ...baseTweet, text: '   ' }, 'https://x.com/x')).toBeNull();
  });

  it('formats a basic tweet with author, handle, date, and text', () => {
    const result = summarizeFxTweet(baseTweet, 'https://x.com/jack/status/20');
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('Post by Jack Dorsey (@jack) on Tue Mar 21 20:50:14 +0000 2006:\n\nhello world');
    expect(result!.sources).toEqual([{ url: 'https://x.com/jack/status/20', title: '@jack on X' }]);
  });

  it('falls back to "Unknown author" when author is missing', () => {
    const result = summarizeFxTweet({ text: 'orphan' }, 'https://x.com/?/status/0');
    expect(result!.summary.startsWith('Post by Unknown author:')).toBe(true);
    expect(result!.sources[0].title).toBe('X post');
  });

  it('falls back to originalUrl when tweet.url is missing', () => {
    const result = summarizeFxTweet({ ...baseTweet, url: undefined }, 'https://fallback.example/');
    expect(result!.sources[0].url).toBe('https://fallback.example/');
  });

  it('annotates attached photos and videos with correct pluralization', () => {
    const result = summarizeFxTweet(
      { ...baseTweet, media: { photos: [{}, {}], videos: [{}] } },
      'https://x.com/jack/status/20'
    );
    expect(result!.summary).toContain('Attached: 2 images, 1 video.');
  });

  it('uses singular "image" for a single photo and no media line when both empty', () => {
    const single = summarizeFxTweet(
      { ...baseTweet, media: { photos: [{}], videos: [] } },
      'https://x.com/jack/status/20'
    );
    expect(single!.summary).toContain('Attached: 1 image.');

    const none = summarizeFxTweet({ ...baseTweet, media: { photos: [], videos: [] } }, 'https://x.com/jack/status/20');
    expect(none!.summary).not.toContain('Attached:');
  });

  it('includes a quoted tweet when present', () => {
    const result = summarizeFxTweet(
      {
        ...baseTweet,
        quote: {
          text: 'quoted thing',
          author: { name: 'Alice', screen_name: 'alice' },
        },
      },
      'https://x.com/jack/status/20'
    );
    expect(result!.summary).toContain('Quotes Alice (@alice): "quoted thing"');
  });

  it('omits the quote block when quote text is empty', () => {
    const result = summarizeFxTweet(
      { ...baseTweet, quote: { text: '   ', author: { name: 'Alice' } } },
      'https://x.com/jack/status/20'
    );
    expect(result!.summary).not.toContain('Quotes');
  });

  it('clamps very long tweets to the summary cap', () => {
    const huge = 'x'.repeat(5_000);
    const result = summarizeFxTweet({ ...baseTweet, text: huge }, 'https://x.com/jack/status/20');
    expect(result!.summary.length).toBeLessThanOrEqual(4_000);
    expect(result!.summary.endsWith('…')).toBe(true);
  });
});
