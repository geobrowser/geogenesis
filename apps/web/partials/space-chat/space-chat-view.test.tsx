import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';
import { spaceChatErrorMessage } from '~/core/space-chat/errors';

import { SPACE_CHAT_VIEW_COPY, SpaceChatView } from './space-chat-view';
import type { ChatViewMessage, ChatViewPerson } from './types';

afterEach(cleanup);

const ANN = '0191aaaa000070008000000000000001';
const BEN = '0191bbbb000070008000000000000002';

function message(id: string, authorId: string, overrides: Partial<ChatViewMessage> = {}): ChatViewMessage {
  return {
    id,
    author: { id: authorId, name: authorId === ANN ? 'Ann' : 'Ben', avatarUrl: null, avatarSeed: authorId },
    body: `body ${id}`,
    createdAt: '2026-11-02T12:00:00Z',
    editedAt: null,
    deleted: false,
    reactions: [],
    ...overrides,
  };
}

const people: ChatViewPerson[] = [
  { id: ANN, name: 'Ann', avatarUrl: null, avatarSeed: ANN },
  { id: BEN, name: 'Ben', avatarUrl: null, avatarSeed: BEN },
];
const nameOf = (id: string) => people.find(person => person.id === id)?.name ?? null;

function renderView(props: Partial<React.ComponentProps<typeof SpaceChatView>> = {}) {
  const onSend = vi.fn(async (_body: string, _replyTo: string | null) => {});
  const onReact = vi.fn(async (_id: string, _value: string, _added: boolean) => {});
  render(
    <SpaceChatView
      label="Space chat"
      status="ready"
      viewerId={ANN}
      composer={{ kind: 'post', onSend, maxLength: 4000, mentionCandidates: people }}
      messages={[message('1', BEN, { body: `hi <@${ANN}>` })]}
      onReact={onReact}
      canReply
      mentionName={nameOf}
      errorMessage={spaceChatErrorMessage}
      {...props}
    />
  );
  return { onSend, onReact };
}

describe('SpaceChatView', () => {
  it('draws mention tokens as names', () => {
    renderView();
    expect(screen.getByText('@Ann')).toBeInTheDocument();
    expect(screen.queryByText(/<@/)).not.toBeInTheDocument();
  });

  it('quotes the message a reply answers, or says it is older than what is loaded', () => {
    renderView({
      messages: [
        message('1', BEN, { body: 'the original' }),
        message('2', ANN, {
          replyTo: { id: '1', found: true, authorName: 'Ben', body: 'the original', deleted: false },
        }),
        message('3', ANN, { replyTo: { id: '0', found: false } }),
      ],
    });
    const quotes = screen.getAllByTestId('space-chat-reply-quote');
    expect(quotes[0]).toHaveTextContent('Ben the original');
    expect(quotes[1]).toHaveTextContent(SPACE_CHAT_VIEW_COPY.originalMessage);
  });

  it('sends a reply with the message it answers', async () => {
    const { onSend } = renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Reply to message' }));
    expect(screen.getByText(SPACE_CHAT_VIEW_COPY.replyingTo('Ben'))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'yes' } });
    await act(async () => fireEvent.submit(screen.getByLabelText('Message').closest('form')!));
    expect(onSend).toHaveBeenCalledWith('yes', '1');
    expect(screen.queryByText(SPACE_CHAT_VIEW_COPY.replyingTo('Ben'))).not.toBeInTheDocument();
  });

  it('toggles a reaction, and adds one from the picker', async () => {
    const { onReact } = renderView({
      messages: [message('1', BEN, { reactions: [{ value: '👍', count: 2, reacted: true }] })],
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '👍 2' })));
    expect(onReact).toHaveBeenLastCalledWith('1', '👍', false);
    fireEvent.click(screen.getByRole('button', { name: 'React to message' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'React 🎉' })));
    expect(onReact).toHaveBeenLastCalledWith('1', '🎉', true);
  });

  it('shows the rate limit and keeps the draft for a resend', async () => {
    const onSend = vi.fn(async () => {
      throw new GeoChatRequestError('rate limit', 'rate_limited', 429, 12_000, { limit: 'sends_by_user' });
    });
    renderView({ composer: { kind: 'post', onSend, maxLength: 4000 } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'again' } });
    await act(async () => fireEvent.submit(screen.getByLabelText('Message').closest('form')!));
    expect(screen.getByRole('alert')).toHaveTextContent('You’re sending messages too fast. Try again in 12s.');
    expect(screen.getByLabelText('Message')).toHaveValue('again');
  });

  describe('composer while sends are in flight', () => {
    const box = () => screen.getByLabelText('Message') as HTMLTextAreaElement;
    const type = (value: string) => fireEvent.change(box(), { target: { value } });
    const enter = () => fireEvent.keyDown(box(), { key: 'Enter' });
    const deferredSend = () => {
      const pending: Array<{ body: string; resolve: () => void; reject: (error: unknown) => void }> = [];
      const onSend = vi.fn(
        (body: string) => new Promise<void>((resolve, reject) => void pending.push({ body, resolve, reject }))
      );
      return { onSend, pending };
    };

    it('clears the box at once and keeps text typed while a send is in flight', async () => {
      const { onSend, pending } = deferredSend();
      renderView({ composer: { kind: 'post', onSend, maxLength: 4000 } });
      type('ok');
      enter();
      expect(box().value).toBe('');
      type('and a follow-up');
      await act(async () => undefined);
      await act(async () => pending[0]!.resolve());
      expect(box().value).toBe('and a follow-up');
    });

    it('sends every message of a rapid burst, one at a time, in order', async () => {
      const { onSend, pending } = deferredSend();
      renderView({ composer: { kind: 'post', onSend, maxLength: 4000 } });
      for (const n of [1, 2, 3, 4, 5]) {
        type(`m${n}`);
        enter();
      }
      expect(box().value).toBe('');
      for (let n = 0; n < 5; n += 1) {
        await act(async () => undefined);
        expect(onSend).toHaveBeenCalledTimes(n + 1);
        await act(async () => pending[n]!.resolve());
      }
      expect(onSend.mock.calls.map(([body]) => body)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    });

    it('shows a rate limit and loses no text: a failed send waits under the error while newer text is typed', async () => {
      const { onSend, pending } = deferredSend();
      renderView({ composer: { kind: 'post', onSend, maxLength: 4000 } });
      type('first');
      enter();
      type('second draft');
      await act(async () => undefined);
      await act(async () =>
        pending[0]!.reject(
          new GeoChatRequestError('rate limit', 'rate_limited', 429, 12_000, { limit: 'sends_by_user' })
        )
      );
      expect(screen.getByRole('alert')).toHaveTextContent('You’re sending messages too fast. Try again in 12s.');
      expect(box().value).toBe('second draft');
      expect(screen.getByText(SPACE_CHAT_VIEW_COPY.notSent('first'))).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: SPACE_CHAT_VIEW_COPY.restore }));
      expect(box().value).toBe('first\nsecond draft');
      expect(screen.queryByText(SPACE_CHAT_VIEW_COPY.notSent('first'))).not.toBeInTheDocument();
    });

    it('puts a failed send back into an empty box', async () => {
      const { onSend, pending } = deferredSend();
      renderView({ composer: { kind: 'post', onSend, maxLength: 4000 } });
      type('lonely');
      enter();
      await act(async () => undefined);
      await act(async () => pending[0]!.reject(new Error('network')));
      expect(box().value).toBe('lonely');
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('keeps the edit box read-only while its save is in flight', async () => {
    let finish: () => void = () => undefined;
    const onEdit = vi.fn(() => new Promise<void>(resolve => (finish = resolve)));
    renderView({ messages: [message('2', ANN, { body: 'mine' })], onEdit });
    fireEvent.click(screen.getByRole('button', { name: 'Edit message' }));
    const editBox = screen.getByLabelText('Edit message') as HTMLTextAreaElement;
    fireEvent.change(editBox, { target: { value: 'mine, edited' } });
    fireEvent.keyDown(editBox, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledWith('2', 'mine, edited');
    expect(editBox.readOnly).toBe(true);
    fireEvent.keyDown(editBox, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it('turns a picked mention into its token on send', async () => {
    const { onSend } = renderView();
    const input = screen.getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'hey @Be', selectionStart: 7 } });
    const picker = screen.getByRole('listbox', { name: 'Mention someone' });
    fireEvent.click(within(picker).getByRole('button', { name: 'Ben' }));
    expect(input).toHaveValue('hey @Ben ');
    await act(async () => fireEvent.submit(input.closest('form')!));
    expect(onSend).toHaveBeenCalledWith(`hey <@${BEN}>`, null);
  });

  it('offers edit only on the viewer’s own messages, and delete on everyone’s to a moderator', () => {
    renderView({
      messages: [message('1', BEN), message('2', ANN)],
      onEdit: vi.fn(async () => {}),
      onDelete: vi.fn(async () => {}),
      canDeleteAny: true,
    });
    const rows = screen.getAllByTestId('space-chat-message');
    expect(within(rows[0]!).queryByRole('button', { name: 'Edit message' })).not.toBeInTheDocument();
    expect(within(rows[0]!).getByRole('button', { name: 'Delete message' })).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('button', { name: 'Edit message' })).toBeInTheDocument();
  });

  it('edits with mentions shown as names and saved as tokens', async () => {
    const onEdit = vi.fn(async () => {});
    renderView({ messages: [message('2', ANN, { body: `ping <@${BEN}>` })], onEdit });
    fireEvent.click(screen.getByRole('button', { name: 'Edit message' }));
    const input = screen.getByLabelText('Edit message');
    expect(input).toHaveValue('ping @Ben');
    fireEvent.change(input, { target: { value: 'ping @Ben now' } });
    await act(async () => fireEvent.submit(input.closest('form')!));
    expect(onEdit).toHaveBeenCalledWith('2', `ping <@${BEN}> now`);
  });

  it('offers older messages while there are more', () => {
    const onLoadOlder = vi.fn();
    renderView({ onLoadOlder });
    fireEvent.click(screen.getByRole('button', { name: SPACE_CHAT_VIEW_COPY.loadOlder }));
    expect(onLoadOlder).toHaveBeenCalled();
  });

  it('offers a signed-out reader Log in in the composer slot', () => {
    const onSignIn = vi.fn();
    renderView({
      composer: { kind: 'sign_in', label: 'Log in and join Geo to chat.', onSignIn },
      onReact: undefined,
      canReply: false,
    });
    expect(screen.getByText('Log in and join Geo to chat.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: SPACE_CHAT_VIEW_COPY.logIn }));
    expect(onSignIn).toHaveBeenCalled();
  });

  it('offers a non-member the Join control in the composer slot', () => {
    const onJoin = vi.fn();
    renderView({
      composer: { kind: 'join', label: 'Members of Geo can post here. Anyone can read.', state: 'idle', onJoin },
      onReact: undefined,
      canReply: false,
    });
    expect(screen.getByText('Members of Geo can post here. Anyone can read.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reply to message' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: SPACE_CHAT_VIEW_COPY.join }));
    expect(onJoin).toHaveBeenCalled();
  });

  it.each([
    ['sending', SPACE_CHAT_VIEW_COPY.join, true],
    ['requested', SPACE_CHAT_VIEW_COPY.membershipRequested, true],
    ['error', SPACE_CHAT_VIEW_COPY.joinRetry, false],
  ] as const)('labels the Join control while %s', (state, name, disabled) => {
    const onJoin = vi.fn();
    renderView({ composer: { kind: 'join', label: 'Members of Geo can post here.', state, onJoin } });
    const button = screen.getByRole('button', { name });
    if (disabled) expect(button).toBeDisabled();
    else expect(button).toBeEnabled();
  });

  it('draws the header with its title, line and recent authors', () => {
    renderView({
      header: {
        title: 'Chat',
        subtitle: 'Everyone can read. Members can post.',
        people: people.map(person => ({ ...person })),
      },
    });
    expect(screen.getByRole('heading', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByText('Everyone can read. Members can post.')).toBeInTheDocument();
  });

  it('separates days, and a divider starts a new group', () => {
    // Three minutes apart, so only the day change keeps the first two from grouping.
    const at = (date: number, hour: number, minute: number) => new Date(2026, 9, date, hour, minute).toISOString();
    renderView({
      messages: [
        message('1', BEN, { createdAt: at(14, 23, 58) }),
        message('2', BEN, { createdAt: at(15, 0, 1) }),
        message('3', BEN, { createdAt: at(15, 0, 2) }),
      ],
    });
    const separators = screen.getAllByRole('separator');
    expect(separators).toHaveLength(2);
    expect(separators[1]).toHaveAccessibleName(/15 Oct/);
    // The day's first message shows its author again; the next one, a minute on, groups.
    expect(screen.getAllByText('Ben')).toHaveLength(2);
  });
});
