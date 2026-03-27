'use client';

import * as React from 'react';
import { useState } from 'react';

import { useComments } from '~/core/hooks/use-comments';
import { useCreateComment } from '~/core/hooks/use-create-comment';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { Avatar } from '~/design-system/avatar';
import { Dropdown } from '~/design-system/dropdown';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import * as Parser from '~/core/state/editor/parser';

import type { CommentFilter, CommentSortOrder, CommentWithReplies } from './types';

interface CommentSectionProps {
  entityId: string;
  spaceId: string;
}

export function CommentSection({ entityId, spaceId }: CommentSectionProps) {
  const { comments, totalCount, isLoading } = useComments({ entityId, spaceId });
  const { createComment, isCreating } = useCreateComment(entityId);

  const [sortOrder, setSortOrder] = useState<CommentSortOrder>('newest');
  const [filter, setFilter] = useState<CommentFilter>('unresolved');

  const handleCreateComment = (text: string, replyToCommentId?: string, replyToCommentSpaceId?: string) => {
    createComment({
      text,
      targetSpaceId: spaceId,
      replyToCommentId,
      replyToCommentSpaceId,
    });
  };

  const filteredComments = React.useMemo(() => {
    let result = [...comments];

    // Filter resolved comments
    if (filter === 'unresolved') {
      result = filterResolved(result);
    }

    // Sort root comments
    if (sortOrder === 'oldest') {
      result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  }, [comments, sortOrder, filter]);

  return (
    <div className="flex w-full flex-col pt-10">
      <div className="flex items-center justify-between">
        <div className="text-mediumTitle">
          Comments {totalCount > 0 && `(${totalCount})`}
        </div>
        {totalCount > 0 && (
          <CommentFilters
            sortOrder={sortOrder}
            onSortChange={setSortOrder}
            filter={filter}
            onFilterChange={setFilter}
          />
        )}
      </div>
      <Spacer height={16} />
      <CommentInput
        onSubmit={text => handleCreateComment(text)}
        isCreating={isCreating}
        placeholder="Write a comment..."
      />
      {isLoading ? (
        <div className="py-4">
          <Text variant="body" color="grey-04">
            Loading comments...
          </Text>
        </div>
      ) : (
        filteredComments.length > 0 && (
          <>
            <Spacer height={24} />
            <CommentList
              comments={filteredComments}
              entityId={entityId}
              spaceId={spaceId}
              onReply={handleCreateComment}
              isCreating={isCreating}
            />
          </>
        )
      )}
    </div>
  );
}

/** Recursively filter out resolved comments and their subtrees */
function filterResolved(comments: CommentWithReplies[]): CommentWithReplies[] {
  return comments
    .filter(c => !c.resolved)
    .map(c => ({
      ...c,
      replies: filterResolved(c.replies),
    }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CommentFilters({
  sortOrder,
  onSortChange,
  filter,
  onFilterChange,
}: {
  sortOrder: CommentSortOrder;
  onSortChange: (order: CommentSortOrder) => void;
  filter: CommentFilter;
  onFilterChange: (filter: CommentFilter) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Dropdown
        trigger={
          <Text variant="smallButton">{sortOrder === 'newest' ? 'Most recent' : 'Oldest'}</Text>
        }
        options={[
          { label: 'Most recent', value: 'newest', disabled: false, onClick: () => onSortChange('newest') },
          { label: 'Oldest', value: 'oldest', disabled: false, onClick: () => onSortChange('oldest') },
        ]}
      />
      <Dropdown
        trigger={
          <Text variant="smallButton">{filter === 'unresolved' ? 'Unresolved' : 'All'}</Text>
        }
        options={[
          { label: 'Unresolved', value: 'unresolved', disabled: false, onClick: () => onFilterChange('unresolved') },
          { label: 'All', value: 'all', disabled: false, onClick: () => onFilterChange('all') },
        ]}
      />
    </div>
  );
}

function CommentInput({
  onSubmit,
  isCreating,
  placeholder,
  autoFocus = false,
  onCancel,
}: {
  onSubmit: (text: string) => void;
  isCreating: boolean;
  placeholder: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}) {
  const [text, setText] = useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && onCancel) {
      onCancel();
    }
  };

  // Auto-resize textarea
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [text]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-grey-02 p-3">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={2}
        className="w-full resize-none bg-transparent text-body text-text outline-none placeholder:text-grey-04"
      />
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded px-3 py-1 text-smallButton text-grey-04 hover:text-text"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isCreating}
          className="rounded bg-text px-3 py-1 text-smallButton text-white disabled:opacity-40"
        >
          {isCreating ? 'Posting...' : 'Post'}
        </button>
      </div>
    </div>
  );
}

function CommentList({
  comments,
  entityId,
  spaceId,
  onReply,
  isCreating,
  depth = 0,
}: {
  comments: CommentWithReplies[];
  entityId: string;
  spaceId: string;
  onReply: (text: string, replyToCommentId?: string, replyToCommentSpaceId?: string) => void;
  isCreating: boolean;
  depth?: number;
}) {
  return (
    <div className={depth > 0 ? 'border-l border-grey-02 pl-4' : ''}>
      {comments.map((comment, index) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          entityId={entityId}
          spaceId={spaceId}
          onReply={onReply}
          isCreating={isCreating}
          isLast={index === comments.length - 1}
          depth={depth}
        />
      ))}
    </div>
  );
}

function CommentItem({
  comment,
  entityId,
  spaceId,
  onReply,
  isCreating,
  isLast,
  depth,
}: {
  comment: CommentWithReplies;
  entityId: string;
  spaceId: string;
  onReply: (text: string, replyToCommentId?: string, replyToCommentSpaceId?: string) => void;
  isCreating: boolean;
  isLast: boolean;
  depth: number;
}) {
  const [isReplying, setIsReplying] = useState(false);

  const handleReply = (text: string) => {
    onReply(text, comment.id, comment.spaceId);
    setIsReplying(false);
  };

  const renderedHtml = React.useMemo(() => {
    return Parser.markdownToHtml(comment.markdownContent);
  }, [comment.markdownContent]);

  const relativeTime = React.useMemo(() => {
    return getRelativeTime(comment.createdAt);
  }, [comment.createdAt]);

  return (
    <div className={!isLast ? 'mb-4' : ''}>
      {/* Comment header: avatar + author + time */}
      <div className="flex items-center gap-2">
        <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full">
          <Avatar
            avatarUrl={comment.author.avatarUrl}
            value={comment.author.spaceId}
            size={24}
          />
        </div>
        <Text variant="smallButton" as="span">
          {comment.author.name ?? 'Anonymous'}
        </Text>
        <Text variant="footnote" color="grey-04" as="span">
          {relativeTime}
        </Text>
        {comment.resolved && (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">Resolved</span>
        )}
      </div>

      {/* Comment body: rendered markdown */}
      <div className="mt-1 ml-8">
        <div
          className="prose prose-sm max-w-none text-body text-text [&_a]:text-ctaPrimary [&_h1]:text-mediumTitle [&_h2]:text-smallTitle [&_h3]:text-body [&_h3]:font-semibold [&_p]:my-1"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />

        {/* Comment actions: vote + reply */}
        <div className="mt-1 flex items-center gap-3">
          <EntityVoteButtons entityId={comment.id} spaceId={comment.spaceId} />
          <button
            onClick={() => setIsReplying(!isReplying)}
            className="text-smallButton text-grey-04 hover:text-text"
          >
            Reply
          </button>
        </div>

        {/* Inline reply input */}
        {isReplying && (
          <div className="mt-2">
            <CommentInput
              onSubmit={handleReply}
              isCreating={isCreating}
              placeholder={`Reply to ${comment.author.name ?? 'comment'}...`}
              autoFocus
              onCancel={() => setIsReplying(false)}
            />
          </div>
        )}

        {/* Nested replies */}
        {comment.replies.length > 0 && (
          <div className="mt-3">
            <CommentList
              comments={comment.replies}
              entityId={entityId}
              spaceId={spaceId}
              onReply={onReply}
              isCreating={isCreating}
              depth={depth + 1}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}
