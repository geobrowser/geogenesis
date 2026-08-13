import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { IPFS_GATEWAY_COUNT, getImagePathAtLevel } from '~/core/utils/utils';

import { Avatar } from './avatar';

afterEach(cleanup);

// The stored image is an `<img alt="">` (presentation role) and the generated one is an
// `<svg role="img">`, so both would answer to the same query — go by tag instead.
const storedImage = (container: HTMLElement) => container.querySelector('img');
const generatedAvatar = (container: HTMLElement) => container.querySelector('svg');

/** Walk the whole gateway fallback chain by failing every attempt. */
function failEveryGateway(container: HTMLElement) {
  for (let attempt = 0; attempt < IPFS_GATEWAY_COUNT; attempt += 1) {
    const img = storedImage(container);
    if (!img) return;
    fireEvent.error(img);
  }
}

describe('Avatar', () => {
  it('draws the generated avatar when there is no image', () => {
    const { container } = render(<Avatar value="Arturas Vil" size={44} />);

    expect(storedImage(container)).toBeNull();
    expect(generatedAvatar(container)).not.toBeNull();
  });

  it('draws the stored image while it still resolves', () => {
    const { container } = render(<Avatar value="Arturas Vil" avatarUrl="ipfs://QmT78z" size={44} />);

    expect(storedImage(container)).not.toBeNull();
    expect(generatedAvatar(container)).toBeNull();
  });

  it('tries the next gateway before giving up on an ipfs image', () => {
    const { container } = render(<Avatar value="Arturas Vil" avatarUrl="ipfs://QmT78z" size={44} />);

    const first = storedImage(container)?.getAttribute('src');
    fireEvent.error(storedImage(container)!);

    expect(storedImage(container)).not.toBeNull();
    expect(storedImage(container)?.getAttribute('src')).not.toBe(first);
  });

  // A stored avatar that no longer resolves anywhere used to leave the browser's broken-image
  // glyph on screen, which is what the community-call cards were showing.
  it('falls back to the generated avatar once no gateway can serve the image', () => {
    const { container } = render(<Avatar value="Arturas Vil" avatarUrl="ipfs://QmT78z" size={44} />);

    failEveryGateway(container);

    expect(storedImage(container)).toBeNull();
    expect(generatedAvatar(container)).not.toBeNull();
  });

  it('gives up immediately on a non-ipfs image, which has no chain to walk', () => {
    const { container } = render(<Avatar value="Arturas Vil" avatarUrl="https://cdn.example/a.png" size={44} />);

    fireEvent.error(storedImage(container)!);

    expect(storedImage(container)).toBeNull();
    expect(generatedAvatar(container)).not.toBeNull();
  });

  it('gives a newly supplied image its own attempt after an earlier one failed', () => {
    const { container, rerender } = render(<Avatar value="Arturas Vil" avatarUrl="ipfs://QmBroken" size={44} />);
    failEveryGateway(container);
    expect(storedImage(container)).toBeNull();

    rerender(<Avatar value="Arturas Vil" avatarUrl="ipfs://QmFresh" size={44} />);

    expect(storedImage(container)).not.toBeNull();
  });

  // Gateway progress belongs to the source that earned it. A live participant row keeps its
  // identity while its avatar url changes underneath, so inheriting the previous url's level would
  // skip the new image straight past gateways that would have served it.
  it('restarts a replacement image at the first gateway', () => {
    const { container, rerender } = render(<Avatar value="Arturas Vil" avatarUrl="ipfs://QmFirst" size={44} />);
    fireEvent.error(storedImage(container)!);
    expect(storedImage(container)?.getAttribute('src')).not.toBe(getImagePathAtLevel('ipfs://QmFirst', 0));

    rerender(<Avatar value="Arturas Vil" avatarUrl="ipfs://QmSecond" size={44} />);

    expect(storedImage(container)?.getAttribute('src')).toBe(getImagePathAtLevel('ipfs://QmSecond', 0));
  });

  // A bare CID mounts no image at all — there is no error event coming — so without an explicit
  // report the avatar would sit blank. Debate surfaces pass `avatar_cid` through raw, so this is
  // reachable outside community calls.
  it('falls back to the generated avatar for a source that can never be requested', () => {
    const { container } = render(<Avatar value="Arturas Vil" avatarUrl="QmBareCidNoScheme" size={44} />);

    expect(storedImage(container)).toBeNull();
    expect(generatedAvatar(container)).not.toBeNull();
  });
});
