/** Space chat view shapes (GEO-3422): lobby chat's `RoomChat` props plus replies, reactions and mentions. */
import type * as React from 'react';

/** Who wrote a message, as the chat view draws them. */
export type ChatViewAuthor = {
  id: string;
  name: string;
  /** An `ipfs://` or https URL; the generated avatar when missing. */
  avatarUrl: string | null;
  /** Seeds the generated avatar. */
  avatarSeed: string;
  profileLink?: string | null;
};

export type ChatViewReaction = { value: string; count: number; reacted: boolean };

export type ChatViewMessage = {
  id: string;
  author: ChatViewAuthor;
  /** Raw, with `<@person_id>` mention tokens. */
  body: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  /** Sent from this tab, not yet confirmed by the server. */
  pending?: boolean;
  /** The message this replies to; `found: false` when it is older than what is loaded. */
  replyTo?:
    { id: string; found: true; authorName: string; body: string; deleted: boolean } | { id: string; found: false };
  reactions?: ChatViewReaction[];
};

/** Someone the composer can mention. */
export type ChatViewPerson = { id: string; name: string; avatarUrl: string | null; avatarSeed: string };

/** What sits under the messages. */
export type ChatViewComposer =
  | {
      kind: 'post';
      /** Rejects with the server's error; the draft stays for a resend. */
      onSend: (body: string, replyToId: string | null) => Promise<void>;
      maxLength: number;
      placeholder?: string;
      /** Offered after `@`; no picker when absent. */
      mentionCandidates?: ChatViewPerson[];
      /** Only replies may be sent (GEO-3818): this line shows until a message is picked to reply to. */
      repliesOnly?: string;
      /** Slow mode: sending waits until this time (ms since epoch). */
      cooldownUntil?: number | null;
    }
  /** Signed out: a Log in control. */
  | { kind: 'sign_in'; label: string; onSignIn: () => void }
  /** Signed in without membership: a Join control, or the request's state once sent. */
  | {
      kind: 'join';
      label: string;
      state: 'idle' | 'sending' | 'requested' | 'error';
      onJoin: () => void;
    }
  /** Posting is not offered here, with a line saying why. */
  | { kind: 'closed'; reason: string }
  | { kind: 'none' };

/** The strip above the messages. */
export type ChatViewHeader = {
  /** A channel picker on phones (GEO-3818). */
  title: React.ReactNode;
  /** Who may read and post, or where else the messages show. */
  subtitle: React.ReactNode;
  /** Recent authors, newest first. */
  people: ChatViewAuthor[];
  /** Controls after the people, such as a channel's Settings. */
  actions?: React.ReactNode;
};

export type ChatViewStatus = 'loading' | 'error' | 'ready';
