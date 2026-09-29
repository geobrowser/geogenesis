import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImageAttachments } from '~/core/chat/image-attachment';

import { useFileAttachment } from './use-file-attachment';

const SPACE_ID = 'c9f267dcb0d270718c2a3c45a64afd32';

function image(name = 'cover.png'): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
}

function heldId(hook: ReturnType<typeof renderHook<ReturnType<typeof useFileAttachment>, unknown>>): string {
  const state = hook.result.current.attachment;
  if (state?.status !== 'image') throw new Error(`expected an image chip, got ${state?.status}`);
  return state.image.id;
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useFileAttachment image lifecycle', () => {
  it('keeps a sent image for the rest of the chat, so a later setEntityImage can find it', async () => {
    const hook = renderHook(() => useFileAttachment(SPACE_ID));
    await act(() => hook.result.current.attach(image()));
    const id = heldId(hook);

    act(() => hook.result.current.dismiss());

    expect(hook.result.current.attachment).toBeNull();
    expect(ImageAttachments.get(id)?.fileName).toBe('cover.png');
    hook.unmount();
  });

  it('releases a sent image once another file replaces it', async () => {
    const hook = renderHook(() => useFileAttachment(SPACE_ID));
    await act(() => hook.result.current.attach(image('first.png')));
    const first = heldId(hook);
    act(() => hook.result.current.dismiss());

    await act(() => hook.result.current.attach(image('second.png')));
    const second = heldId(hook);

    expect(ImageAttachments.get(first)).toBeNull();
    expect(ImageAttachments.get(second)?.fileName).toBe('second.png');
    hook.unmount();
  });

  it('releases every held image when the chat is removed, sent or still on the chip', async () => {
    const hook = renderHook(() => useFileAttachment(SPACE_ID));
    await act(() => hook.result.current.attach(image('sent.png')));
    const sent = heldId(hook);
    act(() => hook.result.current.dismiss());
    await act(() => hook.result.current.attach(image('pending.png')));
    const pending = heldId(hook);
    expect(ImageAttachments.get(sent)).toBeNull();

    act(() => hook.result.current.remove());

    expect(hook.result.current.attachment).toBeNull();
    expect(ImageAttachments.get(pending)).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    hook.unmount();
  });

  it('releases a sent image on unmount', async () => {
    const hook = renderHook(() => useFileAttachment(SPACE_ID));
    await act(() => hook.result.current.attach(image()));
    const id = heldId(hook);
    act(() => hook.result.current.dismiss());
    expect(ImageAttachments.get(id)).not.toBeNull();

    hook.unmount();

    expect(ImageAttachments.get(id)).toBeNull();
  });

  it('is unbothered by an image setEntityImage already consumed', async () => {
    const hook = renderHook(() => useFileAttachment(SPACE_ID));
    await act(() => hook.result.current.attach(image()));
    const id = heldId(hook);
    act(() => hook.result.current.dismiss());
    ImageAttachments.clear(id);

    act(() => hook.result.current.remove());
    hook.unmount();

    expect(ImageAttachments.get(id)).toBeNull();
  });
});
