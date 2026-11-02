/**
 * The space chat view's shapes (GEO-3422). They follow lobby chat's `RoomChat` props
 * (`partials/room-chat` on the lobby-watch branch) with replies, reactions and mentions as optional
 * additions, so the two views can fold into one.
 */

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
    }
  /** Reading is open, posting needs an account. */
  | { kind: 'sign_in'; label: string; onSignIn: () => void }
  /** Posting is not offered here, with a line saying why. */
  | { kind: 'closed'; reason: string }
  | { kind: 'none' };

export type ChatViewStatus = 'loading' | 'error' | 'ready';
