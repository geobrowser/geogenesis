import { beforeEach, describe, expect, it } from 'vitest';

import { arrivedFromEmail, noteEmailArrival, readRefEmail } from './ref-email';

const params = (search: string) => new URLSearchParams(search);

describe('readRefEmail', () => {
  it('keeps a slug and drops anything that could carry text or an address', () => {
    expect(readRefEmail(params('ref_email=digest_away-2'))).toBe('digest_away-2');
    expect(readRefEmail(params('ref_email=someone%40example.com'))).toBeNull();
    expect(readRefEmail(params('ref_email=two%20words'))).toBeNull();
    expect(readRefEmail(params(`ref_email=${'a'.repeat(65)}`))).toBeNull();
    expect(readRefEmail(null)).toBeNull();
  });
});

describe('email arrival', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('lasts the session once the landing URL came from an email, wherever the visitor goes next', () => {
    noteEmailArrival('?ref_email=digest');
    expect(arrivedFromEmail('')).toBe(true);
  });

  it('is not set by a landing from anywhere else', () => {
    noteEmailArrival('?via=marketing');
    expect(arrivedFromEmail('')).toBe(false);
  });

  it('answers from the URL itself before anything has noted it', () => {
    expect(arrivedFromEmail('?ref_email=welcome')).toBe(true);
  });
});
