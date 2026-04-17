'use client';

import * as React from 'react';
import { useState } from 'react';

import { useComments } from '~/core/hooks/use-comments';
import { useCreateComment } from '~/core/hooks/use-create-comment';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSpace } from '~/core/hooks/use-space';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Dropdown } from '~/design-system/dropdown';
import { EditSmall } from '~/design-system/icons/edit-small';
import { RightArrowDiagonal } from '~/design-system/icons/right-arrow-diagonal';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import { renderMarkdownDocument } from '~/core/state/editor/markdown-render';

import type { CommentFilter, CommentSortOrder, CommentWithReplies } from './types';

interface CommentSectionProps {
  entityId: string;
  spaceId: string;
}

export function CommentSection({ entityId, spaceId }: CommentSectionProps) {
  const { comments, totalCount, isLoading } = useComments({ entityId, spaceId });
  const { createComment, editComment, isCreating } = useCreateComment(entityId);
  const { personalSpaceId } = usePersonalSpaceId();
  const { space } = useSpace(spaceId);

  const editorSpaceIds = React.useMemo(() => {
    return new Set(space?.editors.map(e => e.toLowerCase()) ?? []);
  }, [space?.editors]);

  const [sortOrder, setSortOrder] = useState<CommentSortOrder>('newest');
  const [filter, setFilter] = useState<CommentFilter>('all');

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#entity-comments') return;

    // Re-scroll to the comments anchor while the page is still settling. Async queries
    // (values, relations, etc.) load after initial mount and push the anchor down, so
    // a single scrollIntoView on mount leaves the user in the wrong spot. We re-anchor
    // on every body resize until the layout is stable OR the user scrolls.
    const el = document.getElementById('entity-comments');
    if (!el) return;

    let stopped = false;
    let lastResizeAt = performance.now();
    let programmaticScrollAt = 0;

    const scrollToAnchor = () => {
      if (stopped) return;
      programmaticScrollAt = performance.now();
      el.scrollIntoView({ behavior: 'auto', block: 'start' });
    };

    scrollToAnchor();

    const observer = new ResizeObserver(() => {
      lastResizeAt = performance.now();
      scrollToAnchor();
    });
    observer.observe(document.body);

    // Bail out if the user initiates a scroll themselves — don't fight them.
    const onScroll = () => {
      // Ignore scrolls within 150ms of our own programmatic scroll.
      if (performance.now() - programmaticScrollAt < 150) return;
      stop();
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    // Stop once the layout has been stable for 800ms, or hard cap at 8s.
    const stabilityInterval = window.setInterval(() => {
      if (performance.now() - lastResizeAt > 800) stop();
    }, 100);
    const hardCap = window.setTimeout(stop, 8000);

    function stop() {
      if (stopped) return;
      stopped = true;
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.clearInterval(stabilityInterval);
      window.clearTimeout(hardCap);
    }

    return stop;
  }, [entityId, spaceId]);

  const handleCreateComment = (text: string, ancestorComments?: Array<{ id: string; spaceId: string }>) => {
    createComment({
      text,
      targetSpaceId: spaceId,
      ancestorComments,
    });
  };

  const handleEditComment = (commentId: string, commentSpaceId: string, newText: string) => {
    editComment({ commentId, commentSpaceId, newText });
  };

  const filteredComments = React.useMemo(() => {
    let result = [...comments];

    if (filter === 'editors') {
      result = filterEditorsOnly(result, editorSpaceIds);
    }

    // Sort root comments
    if (sortOrder === 'oldest') {
      result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  }, [comments, sortOrder, filter, editorSpaceIds]);

  return (
    <div id="entity-comments" className="flex w-full scroll-mt-24 flex-col pt-10">
      <div className="text-mediumTitle">
        Comments ({totalCount})
      </div>
      <Spacer height={16} />
      <TopLevelCommentInput
        onSubmit={text => handleCreateComment(text)}
        isCreating={isCreating}
      />
      {totalCount > 0 && (
        <>
          <Spacer height={16} />
          <CommentFilters
            sortOrder={sortOrder}
            onSortChange={setSortOrder}
            filter={filter}
            onFilterChange={setFilter}
          />
        </>
      )}
      {isLoading ? (
        <div className="py-4">
          <Text variant="body" color="grey-04">
            Loading comments...
          </Text>
        </div>
      ) : (
        filteredComments.length > 0 && (
          <>
            <Spacer height={16} />
            <CommentList
              comments={filteredComments}
              entityId={entityId}
              spaceId={spaceId}
              onReply={handleCreateComment}
              onEdit={handleEditComment}
              isCreating={isCreating}
              personalSpaceId={personalSpaceId}
              editorSpaceIds={editorSpaceIds}
            />
          </>
        )
      )}
    </div>
  );
}

/** Recursively filter comments to only those authored by space editors. */
function filterEditorsOnly(comments: CommentWithReplies[], editorSpaceIds: Set<string>): CommentWithReplies[] {
  return comments
    .filter(c => editorSpaceIds.has(c.spaceId.toLowerCase()))
    .map(c => ({
      ...c,
      replies: filterEditorsOnly(c.replies, editorSpaceIds),
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
          <Text variant="smallButton">{filter === 'all' ? 'All' : 'Editors replies'}</Text>
        }
        options={[
          { label: 'All', value: 'all', disabled: false, onClick: () => onFilterChange('all') },
          { label: 'Editors replies', value: 'editors', disabled: false, onClick: () => onFilterChange('editors') },
        ]}
      />
    </div>
  );
}

/** Top-level pill-style input matching the design ("Start the discussion...") */
function TopLevelCommentInput({
  onSubmit,
  isCreating,
}: {
  onSubmit: (text: string) => void;
  isCreating: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full rounded-lg border border-grey-02 px-4 py-3 text-left text-body text-grey-04 hover:border-text"
      >
        Start the discussion...
      </button>
    );
  }

  return (
    <CommentInput
      onSubmit={text => {
        onSubmit(text);
        setIsExpanded(false);
      }}
      isCreating={isCreating}
      placeholder=""
      autoFocus
      onCancel={() => setIsExpanded(false)}
    />
  );
}

function CommentInput({
  onSubmit,
  isCreating,
  placeholder,
  autoFocus = false,
  onCancel,
  initialValue = '',
}: {
  onSubmit: (text: string) => void;
  isCreating: boolean;
  placeholder: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  initialValue?: string;
}) {
  const [text, setText] = useState(initialValue);
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

  const hasText = text.trim().length > 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-grey-02 p-3">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={3}
        className="w-full resize-none bg-transparent text-body text-text outline-none placeholder:text-grey-04"
      />
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-md border border-grey-02 px-3 py-1 text-smallButton text-text hover:bg-bg"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!hasText || isCreating}
          className={
            hasText && !isCreating
              ? 'rounded-md bg-text px-3 py-1 text-smallButton text-white'
              : 'rounded-md border border-grey-02 px-3 py-1 text-smallButton text-grey-04'
          }
        >
          {isCreating ? 'Commenting...' : 'Comment'}
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
  onEdit,
  isCreating,
  personalSpaceId,
  editorSpaceIds,
  depth = 0,
  ancestors = [],
}: {
  comments: CommentWithReplies[];
  entityId: string;
  spaceId: string;
  onReply: (text: string, ancestorComments?: Array<{ id: string; spaceId: string }>) => void;
  onEdit: (commentId: string, commentSpaceId: string, newText: string) => void;
  isCreating: boolean;
  personalSpaceId: string | null;
  editorSpaceIds: Set<string>;
  depth?: number;
  ancestors?: Array<{ id: string; spaceId: string }>;
}) {
  if (depth === 0) {
    return (
      <div>
        {comments.map((comment, index) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            entityId={entityId}
            spaceId={spaceId}
            onReply={onReply}
            onEdit={onEdit}
            isCreating={isCreating}
            personalSpaceId={personalSpaceId}
            editorSpaceIds={editorSpaceIds}
            isLast={index === comments.length - 1}
            depth={depth}
            ancestors={ancestors}
          />
        ))}
      </div>
    );
  }

  // Nested replies with connector lines.
  // This container lives inside the parent comment's ml-[44px] body area.
  // The parent's avatar center is at -28px from this container's left edge.
  // We render a single continuous vertical line spanning from top to the last reply's
  // avatar center, then each reply gets a horizontal arm (or curve for the last one).
  const containerRef = React.useRef<HTMLDivElement>(null);
  const lastReplyRef = React.useRef<HTMLDivElement>(null);
  const [lastReplyTop, setLastReplyTop] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (containerRef.current && lastReplyRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const lastRect = lastReplyRef.current.getBoundingClientRect();
      setLastReplyTop(lastRect.top - containerRect.top);
    }
  });

  return (
    <div className="relative" ref={containerRef}>
      {/* Single continuous vertical line from top to just before the last reply's curve */}
      {lastReplyTop != null && (
        <div
          className="absolute w-px bg-grey-02"
          style={{
            left: '-28px',
            top: 0,
            height: `${lastReplyTop}px`,
          }}
        />
      )}
      {comments.map((comment, index) => {
        const isLastReply = index === comments.length - 1;
        return (
          <div
            key={comment.id}
            className="relative"
            ref={isLastReply ? lastReplyRef : undefined}
          >
            {isLastReply ? (
              /* Last reply: curved L-connector from vertical line to avatar */
              <svg
                className="absolute overflow-visible"
                style={{ left: '-28px', top: 0, width: '28px', height: '16px' }}
                viewBox="0 0 28 16"
                fill="none"
              >
                <path d="M 0.5 0 L 0.5 6 Q 0.5 15.5, 10 15.5 L 28 15.5" stroke="var(--color-grey-02)" strokeWidth="1" fill="none" />
              </svg>
            ) : (
              /* Non-last reply: horizontal arm from vertical line to avatar */
              <div
                className="absolute h-px bg-grey-02"
                style={{ left: '-28px', top: '16px', width: '28px' }}
              />
            )}
            <CommentItem
              comment={comment}
              entityId={entityId}
              spaceId={spaceId}
              onReply={onReply}
              onEdit={onEdit}
              isCreating={isCreating}
              personalSpaceId={personalSpaceId}
              editorSpaceIds={editorSpaceIds}
              isLast={index === comments.length - 1}
              depth={depth}
              ancestors={ancestors}
            />
          </div>
        );
      })}
    </div>
  );
}

function CommentItem({
  comment,
  entityId,
  spaceId,
  onReply,
  onEdit,
  isCreating,
  personalSpaceId,
  editorSpaceIds,
  isLast,
  depth,
  ancestors,
}: {
  comment: CommentWithReplies;
  entityId: string;
  spaceId: string;
  onReply: (text: string, ancestorComments?: Array<{ id: string; spaceId: string }>) => void;
  onEdit: (commentId: string, commentSpaceId: string, newText: string) => void;
  isCreating: boolean;
  personalSpaceId: string | null;
  editorSpaceIds: Set<string>;
  isLast: boolean;
  depth: number;
  ancestors: Array<{ id: string; spaceId: string }>;
}) {
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const isOwnComment = personalSpaceId != null && comment.spaceId === personalSpaceId;
  const isEditor = editorSpaceIds.has(comment.spaceId.toLowerCase());

  const handleReply = (text: string) => {
    // Build full ancestor chain: this comment + all its ancestors
    const fullAncestors = [{ id: comment.id, spaceId: comment.spaceId }, ...ancestors];
    onReply(text, fullAncestors);
    setIsReplying(false);
  };

  const handleEdit = (newText: string) => {
    onEdit(comment.id, comment.spaceId, newText);
    setIsEditing(false);
  };

  const renderedContent = React.useMemo(() => {
    return renderMarkdownDocument(comment.markdownContent);
  }, [comment.markdownContent]);

  const relativeTime = React.useMemo(() => {
    return getRelativeTime(comment.createdAt);
  }, [comment.createdAt]);

  const hasReplies = comment.replies.length > 0;
  const commentRef = React.useRef<HTMLDivElement>(null);
  const repliesRef = React.useRef<HTMLDivElement>(null);
  const [parentLineHeight, setParentLineHeight] = React.useState<number | null>(null);

  // Measure the distance from the avatar bottom to where the nested replies container starts
  React.useEffect(() => {
    if (hasReplies && commentRef.current && repliesRef.current) {
      const commentRect = commentRef.current.getBoundingClientRect();
      const repliesRect = repliesRef.current.getBoundingClientRect();
      // Line goes from below avatar (32px) to the top of the replies container
      setParentLineHeight(repliesRect.top - commentRect.top - 32);
    }
  });

  return (
    <div ref={commentRef} className={`relative ${!isLast ? 'mb-6' : ''}`}>
      {/* Vertical line from parent avatar down to the replies container */}
      {hasReplies && parentLineHeight != null && (
        <div
          className="absolute w-px bg-grey-02"
          style={{
            left: '16px', /* center of 32px avatar */
            top: '32px', /* below the avatar */
            height: `${parentLineHeight}px`,
          }}
        />
      )}
      {/* Comment header: avatar + author + time */}
      <div className="flex items-center gap-3">
        <a href={NavUtils.toSpace(comment.author.spaceId)} className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
          <Avatar
            avatarUrl={comment.author.avatarUrl}
            value={comment.author.address}
            size={32}
          />
        </a>
        <div className="flex items-center gap-2">
          <a href={NavUtils.toSpace(comment.author.spaceId)} className="hover:underline">
            <Text variant="bodySemibold" as="span">
              {comment.author.name ?? 'Anonymous'}
            </Text>
          </a>
          {isEditor && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-grey-01">
              <EditSmall color="grey-04" />
            </span>
          )}
          <Text variant="footnote" color="grey-04" as="span">
            {relativeTime}
          </Text>
          {comment.resolved && (
            <span className="inline-flex items-center gap-1 rounded-full bg-successTertiary px-2 py-0.5 text-resultSuccess">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6L5 8.5L9.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-xs font-medium">Resolved</span>
            </span>
          )}
        </div>
      </div>

      {/* Comment body: rendered markdown */}
      <div className="mt-1 ml-[44px]">
        {isEditing ? (
          <CommentInput
            onSubmit={handleEdit}
            isCreating={isCreating}
            placeholder="Edit your comment..."
            autoFocus
            onCancel={() => setIsEditing(false)}
            initialValue={comment.markdownContent}
          />
        ) : (
          <div className="prose prose-sm max-w-none text-body text-text [&_a]:text-ctaPrimary [&_h1]:text-mediumTitle [&_h2]:text-smallTitle [&_h3]:text-body [&_h3]:font-semibold [&_p]:my-1">
            {renderedContent}
          </div>
        )}

        {/* Comment actions: vote + reply + edit */}
        {!isEditing && (
          <div className="mt-2 flex items-center gap-4">
            <EntityVoteButtons entityId={comment.id} spaceId={comment.spaceId} />
            <button
              onClick={() => setIsReplying(!isReplying)}
              className="text-smallButton text-grey-04 hover:text-text"
            >
              Reply
            </button>
            {isOwnComment && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-smallButton text-grey-04 hover:text-text"
              >
                Edit
              </button>
            )}
            <a
              href={NavUtils.toEntity(spaceId, comment.id)}
              className="inline-flex scale-75 items-center text-grey-04 hover:text-text"
            >
              <RightArrowDiagonal color="grey-04" />
            </a>
          </div>
        )}

        {/* Inline reply input */}
        {isReplying && (
          <div className="mt-3">
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
          <div className="mt-4" ref={repliesRef}>
            <CommentList
              comments={comment.replies}
              entityId={entityId}
              spaceId={spaceId}
              onReply={onReply}
              onEdit={onEdit}
              isCreating={isCreating}
              personalSpaceId={personalSpaceId}
              editorSpaceIds={editorSpaceIds}
              depth={depth + 1}
              ancestors={[{ id: comment.id, spaceId: comment.spaceId }, ...ancestors]}
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
  if (diffMinutes < 60) return `${diffMinutes} mins`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}
