import { act, renderHook } from '@testing-library/react';

import { RoomEvent } from 'livekit-client';
import type { Room } from 'livekit-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CALL_EXTENSION_MS, MAX_CALL_EXTENSION_MS, useCallExtension } from './use-call-extension';

/**
 * `useDataChannel` is the transport under test's only outside dependency. The fake keeps the
 * registered handler so a test can deliver a message as if a peer had sent it, and records
 * what this client published.
 */
const channel = {
  handler: null as ((msg: { payload: Uint8Array; from?: { metadata?: string } }) => void) | null,
  sent: [] as unknown[],
};

vi.mock('@livekit/components-react', () => ({
  useDataChannel: (_topic: string, handler: (msg: { payload: Uint8Array; from?: { metadata?: string } }) => void) => {
    channel.handler = handler;
    return {
      send: (payload: Uint8Array) => {
        channel.sent.push(JSON.parse(new TextDecoder().decode(payload)));
      },
    };
  },
}));

function createFakeRoom() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const room = {
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return room;
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(handler);
      return room;
    },
  };
  const emit = (event: string, ...args: unknown[]) => {
    for (const handler of [...(listeners.get(event) ?? [])]) handler(...args);
  };
  return { room: room as unknown as Room, emit };
}

const editor = { metadata: JSON.stringify({ isEditor: true }) };
const guest = { metadata: JSON.stringify({ isEditor: false }) };

const deliver = (from: { metadata?: string } | undefined, body: unknown) =>
  act(() => {
    channel.handler?.({ payload: new TextEncoder().encode(JSON.stringify(body)), from });
  });

afterEach(() => {
  channel.handler = null;
  channel.sent = [];
});

describe('useCallExtension', () => {
  it('extends the call and tells the rest of the room', () => {
    const { room } = createFakeRoom();
    const { result } = renderHook(() => useCallExtension({ room, canExtend: true }));

    act(() => result.current.extend());

    expect(result.current.extensionMs).toBe(CALL_EXTENSION_MS);
    expect(channel.sent).toEqual([{ extensionMs: CALL_EXTENSION_MS }]);
  });

  it('accepts an extension announced by an editor', () => {
    // The point of the whole mechanism: every client enforces the cutoff itself, so a host
    // who extended only locally would keep talking while everyone else was dropped.
    const { room } = createFakeRoom();
    const { result } = renderHook(() => useCallExtension({ room, canExtend: false }));

    deliver(editor, { extensionMs: CALL_EXTENSION_MS });

    expect(result.current.extensionMs).toBe(CALL_EXTENSION_MS);
  });

  it('ignores an extension from a participant who is not an editor', () => {
    // Any participant can publish data, so gating the button alone would be decoration.
    const { room } = createFakeRoom();
    const { result } = renderHook(() => useCallExtension({ room, canExtend: false }));

    deliver(guest, { extensionMs: CALL_EXTENSION_MS });

    expect(result.current.extensionMs).toBe(0);
  });

  it('never shortens a call, whatever arrives', () => {
    // Monotonicity is what makes rebroadcasting safe — duplicates and out-of-order
    // messages have to be harmless.
    const { room } = createFakeRoom();
    const { result } = renderHook(() => useCallExtension({ room, canExtend: true }));

    act(() => result.current.extend());
    act(() => result.current.extend());
    deliver(editor, { extensionMs: CALL_EXTENSION_MS });

    expect(result.current.extensionMs).toBe(2 * CALL_EXTENSION_MS);
  });

  it('re-announces the extension when someone joins late', () => {
    const { room, emit } = createFakeRoom();
    const { result } = renderHook(() => useCallExtension({ room, canExtend: true }));

    act(() => result.current.extend());
    channel.sent = [];
    act(() => emit(RoomEvent.ParticipantConnected));

    expect(channel.sent).toEqual([{ extensionMs: CALL_EXTENSION_MS }]);
  });

  it('stays quiet on a join when nothing has been extended', () => {
    const { room, emit } = createFakeRoom();
    renderHook(() => useCallExtension({ room, canExtend: true }));

    act(() => emit(RoomEvent.ParticipantConnected));

    expect(channel.sent).toEqual([]);
  });

  it('stops extending at the ceiling', () => {
    // A call left open by accident still has to end.
    const { room } = createFakeRoom();
    const { result } = renderHook(() => useCallExtension({ room, canExtend: true }));

    for (let i = 0; i < 10; i++) act(() => result.current.extend());

    expect(result.current.extensionMs).toBe(MAX_CALL_EXTENSION_MS);
    expect(result.current.canExtendFurther).toBe(false);
  });

  it('clamps an announced extension to the ceiling too', () => {
    const { room } = createFakeRoom();
    const { result } = renderHook(() => useCallExtension({ room, canExtend: false }));

    deliver(editor, { extensionMs: 99 * 60 * 60 * 1000 });

    expect(result.current.extensionMs).toBe(MAX_CALL_EXTENSION_MS);
  });

  it('does not extend for someone who may not', () => {
    const { room } = createFakeRoom();
    const { result } = renderHook(() => useCallExtension({ room, canExtend: false }));

    act(() => result.current.extend());

    expect(result.current.extensionMs).toBe(0);
    expect(channel.sent).toEqual([]);
  });

  it('ignores malformed and nonsensical payloads', () => {
    const { room } = createFakeRoom();
    const { result } = renderHook(() => useCallExtension({ room, canExtend: false }));

    deliver(editor, { extensionMs: 'soon' });
    deliver(editor, { extensionMs: -CALL_EXTENSION_MS });
    deliver(editor, {});
    act(() => {
      channel.handler?.({ payload: new TextEncoder().encode('not json'), from: editor });
    });

    expect(result.current.extensionMs).toBe(0);
  });
});
