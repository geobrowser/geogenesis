'use client';

import { useChat } from '@livekit/components-react';

import * as React from 'react';

import { getCallChat, sendChatMessage } from './api';
import { parseParticipantMetadata } from './types';
import { useCommunityCallIdentityToken } from './use-identity-token';

export type ChatEntry = {
  id: string;
  senderIdentity: string;
  senderName: string;
  senderAvatarCid: string | null;
  content: string;
  timestamp: number;
  /** Ephemeral — sent over LiveKit's data channel only, never persisted to chat history. */
  attachedFiles?: File[];
};

const HISTORY_POLL_MS = 15_000;

const LAST_SEEN_KEY_PREFIX = 'chat-last-seen-id:';

function lastSeenKey(roomName: string, userIdentity: string): string {
  return `${LAST_SEEN_KEY_PREFIX}${userIdentity}:${roomName}`;
}

function getLastSeenMessageId(roomName: string, userIdentity: string): string {
  try {
    return localStorage.getItem(lastSeenKey(roomName, userIdentity)) ?? '';
  } catch {
    return '';
  }
}

function setLastSeenMessageId(roomName: string, userIdentity: string, messageId: string): void {
  try {
    localStorage.setItem(lastSeenKey(roomName, userIdentity), messageId);
  } catch {
    // localStorage may be unavailable (private browsing, quota, etc.)
  }
}

/**
 * Merges LiveKit's live data-channel chat with curator-backend's persisted history.
 * Polling exists to backfill messages sent before this client connected — live
 * messages always win over history on ID collision. Sending writes to both: the
 * live channel first (so it shows immediately), then persistence (best-effort —
 * a failed persist still leaves the message visible for the current session).
 *
 * Also tracks a last-seen message id in localStorage, keyed by room + user
 * identity: while `isChatVisible` is true, last-seen advances to the newest
 * message; while hidden, a genuinely new message (newer than what's already
 * marked seen) fires `onNewMessage` instead — the caller surfaces that as an
 * unread indicator.
 */
export function usePersistentChat(args: {
  spaceId: string;
  callId: string;
  occurrenceStart: number;
  roomName: string;
  userIdentity: string;
  isChatVisible: boolean;
  onNewMessage?: () => void;
}) {
  const { spaceId, callId, occurrenceStart, roomName, userIdentity, isChatVisible, onNewMessage } = args;
  const { chatMessages, send: sendLive } = useChat();
  const { getToken } = useCommunityCallIdentityToken();
  const [history, setHistory] = React.useState<ChatEntry[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    const fetchHistory = async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      try {
        const { messages } = await getCallChat({ spaceId, callId, occurrenceStart }, token);
        if (!cancelled) {
          setHistory(
            messages.map(m => ({
              id: m.id,
              senderIdentity: m.senderIdentity,
              senderName: m.senderName,
              senderAvatarCid: m.senderAvatarCid ?? null,
              content: m.content,
              timestamp: m.timestamp,
            }))
          );
        }
      } catch {
        // best-effort — live messages still render even if history is unreachable
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, HISTORY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [spaceId, callId, occurrenceStart, getToken]);

  const live: ChatEntry[] = chatMessages.map(m => ({
    id: m.id,
    senderIdentity: m.from?.identity ?? 'unknown',
    senderName: m.from?.name || m.from?.identity || 'Unknown',
    senderAvatarCid: parseParticipantMetadata(m.from?.metadata).avatarCid ?? null,
    content: m.message,
    timestamp: m.timestamp,
    attachedFiles: m.attachedFiles,
  }));

  const liveIds = new Set(live.map(m => m.id));
  const messages = [...history.filter(m => !liveIds.has(m.id)), ...live].sort((a, b) => a.timestamp - b.timestamp);

  const latestId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const latestIdRef = React.useRef<string | null>(null);
  latestIdRef.current = latestId;

  // While visible, keep last-seen advancing to the newest message — including on
  // hide/unmount, so closing the panel right as a message lands doesn't re-flag
  // it as unread the next time this room is opened.
  React.useEffect(() => {
    if (!isChatVisible || !roomName || !userIdentity) return;
    if (latestIdRef.current) setLastSeenMessageId(roomName, userIdentity, latestIdRef.current);
    return () => {
      if (latestIdRef.current) setLastSeenMessageId(roomName, userIdentity, latestIdRef.current);
    };
  }, [isChatVisible, roomName, userIdentity]);

  // While hidden, flag genuinely-new arrivals (newer than what's already marked seen).
  React.useEffect(() => {
    if (isChatVisible || !latestId || !roomName || !userIdentity) return;
    if (latestId !== getLastSeenMessageId(roomName, userIdentity)) {
      onNewMessage?.();
    }
  }, [latestId, isChatVisible, roomName, userIdentity, onNewMessage]);

  const send = React.useCallback(
    async (content: string, files?: File[]) => {
      // Attachments are ephemeral (LiveKit's native data-channel `attachments` option) —
      // only the text is persisted to chat history, matching curator-backend's schema.
      const sent = await sendLive(content, files?.length ? { attachments: files } : undefined);
      const token = await getToken();
      if (token) {
        sendChatMessage(
          { spaceId, callId, occurrenceStart, id: sent.id, content, timestamp: sent.timestamp },
          token
        ).catch(() => {});
      }
    },
    [sendLive, getToken, spaceId, callId, occurrenceStart]
  );

  return { messages, send };
}
