import { describe, expect, it } from 'vitest';

import { MAX_PROFILE_IMAGE_BYTES, validateProfileImage } from './profile-edit-rules';

function fakeFile({ type, size }: { type: string; size: number }) {
  const file = new File([''], 'upload', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validateProfileImage', () => {
  it('accepts a PNG under the ceiling', () => {
    expect(validateProfileImage(fakeFile({ type: 'image/png', size: 1024 }), 'banner')).toBeNull();
  });

  it('accepts a JPEG under the ceiling', () => {
    expect(validateProfileImage(fakeFile({ type: 'image/jpeg', size: 1024 }), 'avatar')).toBeNull();
  });

  // The file picker's `accept` filters these out, but a drag-and-drop does not.
  it('rejects a format the picker would have filtered', () => {
    expect(validateProfileImage(fakeFile({ type: 'image/gif', size: 1024 }), 'banner')).toBe(
      'Banners have to be a PNG or JPEG.'
    );
    expect(validateProfileImage(fakeFile({ type: 'image/svg+xml', size: 1024 }), 'avatar')).toBe(
      'Photos have to be a PNG or JPEG.'
    );
  });

  it('names the offending size when a file is too large', () => {
    const eightPointTwoMb = Math.round(8.2 * 1024 * 1024);
    expect(validateProfileImage(fakeFile({ type: 'image/jpeg', size: eightPointTwoMb }), 'banner')).toBe(
      'That file is 8.2 MB. Banners have to be 5 MB or less.'
    );
  });

  // The hint says "up to 5 MB" and the validator accepts exactly that, so the
  // rejection has to agree rather than say "under 5 MB".
  it('accepts a file exactly at the ceiling and rejects one byte over', () => {
    expect(validateProfileImage(fakeFile({ type: 'image/png', size: MAX_PROFILE_IMAGE_BYTES }), 'banner')).toBeNull();
    expect(
      validateProfileImage(fakeFile({ type: 'image/png', size: MAX_PROFILE_IMAGE_BYTES + 1 }), 'banner')
    ).toContain('have to be 5 MB or less');
  });

  // 5.04 MB rounds to "5.0 MB", which would read as within a 5 MB limit. The
  // message still has to explain the rejection.
  it('rounds a just-over file up rather than down to the limit', () => {
    const justOver = MAX_PROFILE_IMAGE_BYTES + 40 * 1024;
    expect(validateProfileImage(fakeFile({ type: 'image/png', size: justOver }), 'avatar')).toBe(
      'That file is 5.1 MB. Photos have to be 5 MB or less.'
    );
  });

  it('reports the format problem first when a file fails both rules', () => {
    expect(validateProfileImage(fakeFile({ type: 'image/gif', size: 40 * 1024 * 1024 }), 'banner')).toBe(
      'Banners have to be a PNG or JPEG.'
    );
  });
});
