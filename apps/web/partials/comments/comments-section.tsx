'use client';

import * as React from 'react';
import { useState } from 'react';

import cx from 'classnames';

import { normalizeSpaceId } from '~/core/access/space-access';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Crown } from '~/core/debates/browse/icons';
import { useDebateVotesByVoter } from '~/core/debates/use-debate-votes';
import type { DebateVoteRecord } from '~/core/debates/vote-tally';
import { useComments } from '~/core/hooks/use-comments';
import { useCreateComment } from '~/core/hooks/use-create-comment';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSpaceEditorIds } from '~/core/hooks/use-space-editor-ids';
import { uuidToHex } from '~/core/id/normalize';
import { renderMarkdownDocument } from '~/core/state/editor/markdown-render';
import { useEnqueuePendingAction } from '~/core/state/pending-actions';
import { useSignInPrompt } from '~/core/state/sign-in-prompt-store';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Dropdown } from '~/design-system/dropdown';
import { Minus } from '~/design-system/icons/minus';
import { Plus } from '~/design-system/icons/plus';
import { RightArrowDiagonal } from '~/design-system/icons/right-arrow-diagonal';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import type { CommentFilter, CommentSortOrder, CommentWithReplies } from './types';

const COMMENT_AVATAR_COL_PX = 32;
const COMMENT_HEADER_GAP_PX = 12;
const COMMENT_BODY_INSET_PX = COMMENT_AVATAR_COL_PX + COMMENT_HEADER_GAP_PX;
const COMMENT_AVATAR_COLUMN_CENTER_PX = COMMENT_AVATAR_COL_PX / 2;

/**
 * Row density. Entity pages use the roomy 32px-avatar layout; side panels (the
 * debates feed's Comments panel) use the design's compact 20px avatar, which
 * pulls the body up under the name instead of leaving it below a tall avatar
 * row. The body inset stays 44px in both so nested threading geometry holds.
 */
type CommentDensity = {
  avatarPx: number;
  bodyInsetPx: number;
  avatarCenterPx: number;
  /** Author name. */
  nameClass: string;
  /** Timestamp, Reply/Edit actions — anything secondary in grey. */
  metaClass: string;
  /** Comment body copy and the composer prompt. */
  bodyClass: string;
};

const PAGE_DENSITY: CommentDensity = {
  avatarPx: COMMENT_AVATAR_COL_PX,
  bodyInsetPx: COMMENT_BODY_INSET_PX,
  avatarCenterPx: COMMENT_AVATAR_COLUMN_CENTER_PX,
  nameClass: 'text-bodySemibold',
  metaClass: 'text-smallButton',
  bodyClass: 'text-body',
};

// Figma's comment type ramp (Geo "Comment name" / "Comment text" / "Comment
// button" tokens): everything is 16px — the page's 20px body and 11px footnote
// are much larger/smaller respectively, and the oversized body is what made the
// column wrap early and look narrow in the panel.
const PANEL_DENSITY: CommentDensity = {
  avatarPx: 20,
  bodyInsetPx: COMMENT_BODY_INSET_PX,
  avatarCenterPx: 10,
  nameClass: 'text-[16px] leading-[13px] font-medium tracking-[-0.35px]',
  metaClass: 'text-[16px] leading-[13px] tracking-[-0.35px]',
  bodyClass: 'text-[16px] leading-[20px] tracking-[-0.35px]',
};

const CommentDensityContext = React.createContext<CommentDensity>(PAGE_DENSITY);

function useCommentDensity(): CommentDensity {
  return React.useContext(CommentDensityContext);
}
const COMMENT_THREAD_LINE_HIT_PX = 20;

const THREAD_LEVEL_BRANCH_SEGMENT = 'thread-level-branch-segment';

const THREAD_SEGMENT_DIM = 'bg-grey-02';
const THREAD_SEGMENT_DIM_STROKE = 'stroke-[var(--color-grey-02)]';
const THREAD_SEGMENT_HI = 'bg-grey-03';
const THREAD_SEGMENT_HI_STROKE = 'stroke-[var(--color-grey-03)]';

type BranchFocus = { kind: 'parent-thread'; threadCommentId: string } | { kind: 'row-connectors'; commentId: string };

type CommentBranchHighlightValue = {
  focus: BranchFocus | null;
  setParentThreadFocus: (threadCommentId: string) => void;
  setRowConnectorFocus: (commentId: string) => void;
  clearFocus: () => void;
  spinePressedListParentId: string | null;
  pressSpineForListParent: (listParentCommentId: string) => void;
};

const CommentBranchHighlightContext = React.createContext<CommentBranchHighlightValue | null>(null);

function useCommentBranchHighlight(): CommentBranchHighlightValue {
  const v = React.useContext(CommentBranchHighlightContext);
  if (!v) {
    throw new Error('useCommentBranchHighlight must be used inside CommentBranchHighlightProvider');
  }
  return v;
}

function CommentBranchHighlightProvider({ children }: { children: React.ReactNode }) {
  const [focus, setFocus] = React.useState<BranchFocus | null>(null);
  const [spinePressedListParentId, setSpinePressedListParentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (spinePressedListParentId == null) return;
    const end = () => setSpinePressedListParentId(null);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [spinePressedListParentId]);

  const value = React.useMemo<CommentBranchHighlightValue>(
    () => ({
      focus,
      setParentThreadFocus: (threadCommentId: string) => setFocus({ kind: 'parent-thread', threadCommentId }),
      setRowConnectorFocus: (commentId: string) => setFocus({ kind: 'row-connectors', commentId }),
      clearFocus: () => setFocus(null),
      spinePressedListParentId,
      pressSpineForListParent: (listParentCommentId: string) => setSpinePressedListParentId(listParentCommentId),
    }),
    [focus, spinePressedListParentId]
  );

  return <CommentBranchHighlightContext.Provider value={value}>{children}</CommentBranchHighlightContext.Provider>;
}

/**
 * Voter space id → who they picked to win the debate being commented on. Context so the
 * badge doesn't have to be threaded through every nesting level of CommentList. Empty for
 * entities that aren't debates.
 */
const DebateVoteBadgeContext = React.createContext<Map<string, DebateVoteRecord>>(new Map());

function CommentVoteBadge({ authorSpaceId }: { authorSpaceId: string }) {
  const vote = React.useContext(DebateVoteBadgeContext).get(uuidToHex(authorSpaceId));
  if (!vote?.winnerName) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-divider px-2 py-1 text-grey-04">
      <Crown size={12} />
      <Text variant="footnote" color="grey-04" as="span">
        {vote.winnerName}
      </Text>
    </span>
  );
}

function replySubtreeContainsCommentId(node: CommentWithReplies, targetId: string): boolean {
  const replies = Array.isArray(node.replies) ? node.replies : [];
  for (const reply of replies) {
    if (reply.id === targetId) return true;
    if (replySubtreeContainsCommentId(reply, targetId)) return true;
  }
  return false;
}

/**
 * Whether this row's connector strip in the parent reply list should skip highlight
 * because focus targets a nested thread strictly under `row` (not `row` itself).
 */
function rowDefersConnectorHighlightToNestedRow(row: CommentWithReplies, focus: BranchFocus | null): boolean {
  if (!focus) return false;
  if (focus.kind === 'parent-thread') {
    if (focus.threadCommentId === row.id) return false;
    return replySubtreeContainsCommentId(row, focus.threadCommentId);
  }
  if (focus.kind === 'row-connectors') {
    if (focus.commentId === row.id) return false;
    return replySubtreeContainsCommentId(row, focus.commentId);
  }
  return false;
}

function branchPointerBlurProps(
  clearFocus: () => void
): Pick<React.HTMLAttributes<HTMLElement>, 'onPointerLeave' | 'onBlur'> {
  return {
    onPointerLeave: e => {
      const next = e.relatedTarget;
      // relatedTarget is EventTarget | null; only Node is valid for Element.contains().
      if (next instanceof Node && e.currentTarget.contains(next)) return;
      clearFocus();
    },
    onBlur: e => {
      const next = e.relatedTarget;
      if (next instanceof Node && e.currentTarget.contains(next)) return;
      clearFocus();
    },
  };
}

export type CommentSectionVariant = 'page' | 'panel';

interface CommentSectionProps {
  entityId: string;
  spaceId: string;
  /**
   * 'page' (default) is the entity page treatment. 'panel' matches the side
   * panel design: no built-in heading (the host supplies one), compact rows,
   * and the avatar + "Join the conversation..." composer.
   */
  variant?: CommentSectionVariant;
}

export function CommentSection({ entityId, spaceId, variant = 'page' }: CommentSectionProps) {
  const { comments, totalCount, isLoading } = useComments({ entityId, spaceId });
  const { createComment, editComment } = useCreateComment(entityId);
  const { personalSpaceId } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const { open: openSignInPrompt } = useSignInPrompt();
  const enqueuePendingAction = useEnqueuePendingAction();
  const isLoggedIn = !!smartAccount;
  const isPanel = variant === 'panel';
  const density = isPanel ? PANEL_DENSITY : PAGE_DENSITY;
  // The panel composer leads with the viewer's own avatar (design).
  const walletAddress = smartAccount?.account.address;
  // Only the panel composer renders this avatar, so entity pages don't pay for
  // the profile lookup (useGeoProfile disables itself without an account).
  const { profile: viewerProfile } = useGeoProfile(isPanel ? walletAddress : undefined);
  const viewerAvatarUrl =
    viewerProfile?.avatarUrl && viewerProfile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? viewerProfile.avatarUrl : null;
  const viewerAvatarSeed = viewerProfile?.address ?? walletAddress ?? personalSpaceId ?? 'anonymous';
  const requireSignInToComment = React.useCallback(() => openSignInPrompt('comment'), [openSignInPrompt]);
  const commentSeqRef = React.useRef(0);
  const commentAuthorSpaceIds = React.useMemo(() => collectCommentAuthorSpaceIds(comments), [comments]);
  const { editorSpaceIds } = useSpaceEditorIds(spaceId, commentAuthorSpaceIds);
  // Resolves to an empty map unless this entity is a Debate. Gated on there being comments
  // so entity pages without any don't pay for the lookup.
  const debateVotesByVoter = useDebateVotesByVoter(entityId, totalCount > 0);

  const [sortOrder, setSortOrder] = useState<CommentSortOrder>('newest');
  const [filter, setFilter] = useState<CommentFilter>('all');

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#entity-comments') return;
    const el = document.getElementById('entity-comments');
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [entityId, spaceId]);

  const [collapsedThreadIds, setCollapsedThreadIds] = React.useState<Set<string>>(() => new Set());

  const isThreadCollapsed = React.useCallback(
    (commentId: string) => collapsedThreadIds.has(commentId),
    [collapsedThreadIds]
  );

  const toggleThreadCollapsed = React.useCallback((commentId: string) => {
    setCollapsedThreadIds(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  }, []);

  // Comments the user created in this session are pinned to the top of their thread group
  // (root or replies) regardless of the active sort, so a just-posted comment doesn't scroll
  // away from the user while they're reading. Cleared on unmount / page refresh.
  // Ordered most-recent-first so back-to-back posts stack in the order they were made.
  const [sessionNewIds, setSessionNewIds] = React.useState<string[]>([]);
  const markSessionNew = React.useCallback((id: string) => {
    setSessionNewIds((prev: string[]) => (prev.includes(id) ? prev : [id, ...prev]));
  }, []);

  // Fire-and-forget: the input boxes close/clear synchronously. The optimistic row appears
  // in the cache immediately (via useCreateComment) with a "Publishing…" tag; sessionNewIds
  // is updated via the onOptimistic callback so the row pins to the top right away.
  const handleCreateComment = React.useCallback(
    (text: string, ancestorComments?: Array<{ id: string; spaceId: string }>) => {
      // The composer only lets a signed-in user type, so smartAccount is present here.
      if (!personalSpaceId) {
        const id = `comment:${entityId}:${(commentSeqRef.current += 1)}`;
        enqueuePendingAction({
          id,
          label: 'your comment',
          requires: 'personalSpace',
          run: () =>
            createComment({
              text,
              targetSpaceId: spaceId,
              ancestorComments,
              onOptimistic: cid => markSessionNew(cid),
            }).then(() => {}),
        });
        return;
      }

      void createComment({
        text,
        targetSpaceId: spaceId,
        ancestorComments,
        onOptimistic: id => markSessionNew(id),
      });
    },
    [createComment, spaceId, personalSpaceId, entityId, enqueuePendingAction, markSessionNew]
  );

  const handleEditComment = React.useCallback(
    (commentId: string, commentSpaceId: string, newText: string) => {
      void editComment({ commentId, commentSpaceId, newText });
    },
    [editComment]
  );

  /**
   * Sort comments by the active dropdown order, then lift any session-new comments to the top
   * in the order they were posted (most recent first). Used at every nesting level so replies
   * and root comments follow the same rules.
   */
  const sortWithSessionPinned = React.useCallback(
    <T extends { id: string; createdAt: string }>(list: T[]): T[] => {
      const sorted = [...list].sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return sortOrder === 'oldest' ? aTime - bTime : bTime - aTime;
      });
      if (sessionNewIds.length === 0) return sorted;
      const pinnedSet = new Set(sessionNewIds);
      // Single pass: build id→item map so pinning is O(N) instead of O(N×M).
      const byId = new Map<string, T>();
      const rest: T[] = [];
      for (const item of sorted) {
        if (pinnedSet.has(item.id)) {
          byId.set(item.id, item);
        } else {
          rest.push(item);
        }
      }
      const pinned: T[] = sessionNewIds.map((id: string) => byId.get(id)).filter((c): c is T => c !== undefined);
      return [...pinned, ...rest];
    },
    [sortOrder, sessionNewIds]
  );

  const filteredComments = React.useMemo(() => {
    let result = comments;
    if (filter === 'editors') {
      result = filterEditorsOnly(result, editorSpaceIds);
    }
    return sortWithSessionPinned(result);
  }, [comments, filter, editorSpaceIds, sortWithSessionPinned]);

  return (
    <CommentDensityContext.Provider value={density}>
      <CommentBranchHighlightProvider>
        <div id="entity-comments" className={cx('flex w-full min-w-0 flex-col', !isPanel && 'pt-10')}>
          {!isPanel && (
            <>
              <div className="text-mediumTitle">Comments ({totalCount})</div>
              <Spacer height={16} />
            </>
          )}
          <TopLevelCommentInput
            onSubmit={handleCreateComment}
            isLoggedIn={isLoggedIn}
            onSignInRequired={requireSignInToComment}
            variant={variant}
            viewerAvatarUrl={viewerAvatarUrl}
            viewerAvatarSeed={viewerAvatarSeed}
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
                <DebateVoteBadgeContext.Provider value={debateVotesByVoter}>
                  <CommentList
                    comments={filteredComments}
                    entityId={entityId}
                    spaceId={spaceId}
                    onReply={handleCreateComment}
                    onEdit={handleEditComment}
                    personalSpaceId={personalSpaceId}
                    editorSpaceIds={editorSpaceIds}
                    isThreadCollapsed={isThreadCollapsed}
                    toggleThreadCollapsed={toggleThreadCollapsed}
                    sortReplies={sortWithSessionPinned}
                    isLoggedIn={isLoggedIn}
                    onSignInRequired={requireSignInToComment}
                  />
                </DebateVoteBadgeContext.Provider>
              </>
            )
          )}
        </div>
      </CommentBranchHighlightProvider>
    </CommentDensityContext.Provider>
  );
}

/** Recursively filter comments to only those authored by space editors. */
function filterEditorsOnly(comments: CommentWithReplies[], editorSpaceIds: Set<string>): CommentWithReplies[] {
  return comments
    .filter(c => editorSpaceIds.has(normalizeSpaceId(c.spaceId)))
    .map(c => ({
      ...c,
      replies: filterEditorsOnly(c.replies, editorSpaceIds),
    }));
}

function collectCommentAuthorSpaceIds(comments: CommentWithReplies[]): string[] {
  const ids = new Set<string>();

  function visit(comment: CommentWithReplies) {
    const spaceId = normalizeSpaceId(comment.spaceId);
    if (spaceId) {
      ids.add(spaceId);
    }
    for (const reply of comment.replies) {
      visit(reply);
    }
  }

  for (const comment of comments) {
    visit(comment);
  }

  return [...ids];
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
        trigger={<Text variant="smallButton">{sortOrder === 'newest' ? 'Most recent' : 'Oldest'}</Text>}
        options={[
          { label: 'Most recent', value: 'newest', disabled: false, onClick: () => onSortChange('newest') },
          { label: 'Oldest', value: 'oldest', disabled: false, onClick: () => onSortChange('oldest') },
        ]}
      />
      <Dropdown
        trigger={<Text variant="smallButton">{filter === 'all' ? 'All' : 'Editors replies'}</Text>}
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
  isLoggedIn,
  onSignInRequired,
  variant = 'page',
  viewerAvatarUrl,
  viewerAvatarSeed,
}: {
  onSubmit: (text: string) => void;
  isLoggedIn: boolean;
  onSignInRequired: () => void;
  variant?: CommentSectionVariant;
  viewerAvatarUrl?: string | null;
  viewerAvatarSeed?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const density = useCommentDensity();

  if (!isExpanded) {
    const openComposer = () => {
      if (!isLoggedIn) {
        onSignInRequired();
        return;
      }
      setIsExpanded(true);
    };

    // The panel design is a borderless row — the viewer's avatar, prompt text,
    // and a rule beneath — rather than the entity page's outlined box.
    if (variant === 'panel') {
      return (
        <button
          onClick={openComposer}
          className="flex w-full items-center gap-3 border-b border-grey-02 pb-3 text-left"
        >
          <span
            className="relative shrink-0 overflow-hidden rounded-full"
            style={{ width: density.avatarPx, height: density.avatarPx }}
          >
            <Avatar avatarUrl={viewerAvatarUrl} value={viewerAvatarSeed} size={density.avatarPx} />
          </span>
          <span className={cx(density.bodyClass, 'min-w-0 flex-1 truncate text-grey-04')}>
            Join the conversation...
          </span>
        </button>
      );
    }

    return (
      <button
        onClick={openComposer}
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
      placeholder=""
      autoFocus
      onCancel={() => setIsExpanded(false)}
    />
  );
}

function CommentInput({
  onSubmit,
  placeholder,
  autoFocus = false,
  onCancel,
  initialValue = '',
}: {
  onSubmit: (text: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  initialValue?: string;
}) {
  const [text, setText] = useState(initialValue);
  const density = useCommentDensity();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  // Guards against a rapid second click (or Enter + click) firing before React re-renders
  // with the cleared text. Set synchronously at the start of submit, released after the
  // current tick so React has a chance to propagate setText('') into the hasText check.
  const isSubmittingRef = React.useRef(false);

  const handleSubmit = () => {
    if (isSubmittingRef.current) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    isSubmittingRef.current = true;
    onSubmit(trimmed);
    setText('');
    setTimeout(() => {
      isSubmittingRef.current = false;
    }, 0);
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

  // Auto-resize: start at one line and grow with the content, so an empty
  // composer doesn't open with blank rows above the buttons. Runs on mount too,
  // which is what collapses the initial box to a single line.
  React.useLayoutEffect(() => {
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
        rows={1}
        className={cx(
          density.bodyClass,
          'w-full resize-none bg-transparent text-text outline-none placeholder:text-grey-04'
        )}
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
          disabled={!hasText}
          className={
            hasText
              ? 'rounded-md bg-text px-3 py-1 text-smallButton text-white'
              : 'rounded-md border border-grey-02 px-3 py-1 text-smallButton text-grey-04'
          }
        >
          Comment
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
  personalSpaceId,
  editorSpaceIds,
  isThreadCollapsed,
  toggleThreadCollapsed,
  sortReplies,
  isLoggedIn,
  onSignInRequired,
  depth = 0,
  ancestors = [],
  parentCommentId,
}: {
  comments: CommentWithReplies[];
  entityId: string;
  spaceId: string;
  onReply: (text: string, ancestorComments?: Array<{ id: string; spaceId: string }>) => void;
  onEdit: (commentId: string, commentSpaceId: string, newText: string) => void;
  personalSpaceId: string | null;
  editorSpaceIds: Set<string>;
  isThreadCollapsed: (commentId: string) => boolean;
  toggleThreadCollapsed: (commentId: string) => void;
  sortReplies: (items: CommentWithReplies[]) => CommentWithReplies[];
  isLoggedIn: boolean;
  onSignInRequired: () => void;
  depth?: number;
  ancestors?: Array<{ id: string; spaceId: string }>;
  parentCommentId?: string;
}) {
  const hi = useCommentBranchHighlight();

  // Keep these hooks above the depth === 0 early return so the hook count stays
  // unconditional (Rules of Hooks). They're inert on that path (containerRef never
  // attaches there).
  const containerRef = React.useRef<HTMLDivElement>(null);
  const lastReplyRef = React.useRef<HTMLDivElement>(null);
  const [lastReplyTop, setLastReplyTop] = React.useState<number | null>(null);

  const listLayoutKey = React.useMemo(
    () => `${comments.length}:${comments.map(c => `${c.id}:${isThreadCollapsed(c.id) ? 1 : 0}`).join(',')}`,
    [comments, isThreadCollapsed]
  );

  const updateLastReplyTop = React.useCallback(() => {
    const container = containerRef.current;
    const lastRow = lastReplyRef.current;
    if (!container || !lastRow) {
      setLastReplyTop(null);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const lastRect = lastRow.getBoundingClientRect();
    setLastReplyTop(lastRect.top - containerRect.top);
  }, []);

  React.useLayoutEffect(() => {
    updateLastReplyTop();
    const container = containerRef.current;
    if (container == null || typeof ResizeObserver === 'undefined') {
      return;
    }
    const ro = new ResizeObserver(() => {
      updateLastReplyTop();
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
    };
  }, [listLayoutKey, updateLastReplyTop]);

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
            personalSpaceId={personalSpaceId}
            editorSpaceIds={editorSpaceIds}
            isThreadCollapsed={isThreadCollapsed}
            toggleThreadCollapsed={toggleThreadCollapsed}
            sortReplies={sortReplies}
            isLoggedIn={isLoggedIn}
            onSignInRequired={onSignInRequired}
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
  // The elbow lands on the reply avatar's vertical centre, so its geometry
  // follows the density's avatar size rather than the 32px avatar these paths
  // were originally drawn against.
  const density = useCommentDensity();
  const armY = density.avatarCenterPx - 0.5;
  const elbowRadius = Math.min(9.5, Math.max(0, armY));
  const elbowPath = `M 0.5 0 L 0.5 ${armY - elbowRadius} Q 0.5 ${armY}, ${0.5 + elbowRadius} ${armY} L 28 ${armY}`;

  const parentBundle =
    parentCommentId != null && hi.focus?.kind === 'parent-thread' && hi.focus.threadCommentId === parentCommentId;
  const listSpineLit = parentBundle || (parentCommentId != null && hi.spinePressedListParentId === parentCommentId);
  const branchLeave = branchPointerBlurProps(hi.clearFocus);

  return (
    <div className="comment-branch-list-root relative" ref={containerRef}>
      {/* Single continuous vertical line from top to just before the last reply's curve */}
      {lastReplyTop != null && parentCommentId != null && (
        <button
          type="button"
          aria-expanded={!isThreadCollapsed(parentCommentId)}
          aria-label={isThreadCollapsed(parentCommentId) ? 'Expand comment thread' : 'Collapse comment thread'}
          onClick={() => toggleThreadCollapsed(parentCommentId)}
          onPointerEnter={() => hi.setParentThreadFocus(parentCommentId)}
          onFocus={() => hi.setParentThreadFocus(parentCommentId)}
          onPointerDown={() => hi.pressSpineForListParent(parentCommentId)}
          {...branchLeave}
          className="comment-branch-hit comment-branch-parent-hit comment-branch-spine-hit absolute z-[1] flex -translate-x-1/2 cursor-pointer justify-center border-0 bg-transparent p-0"
          style={{
            left: 'calc(-28px + 0.5px)',
            top: 0,
            height: `${lastReplyTop}px`,
            width: `${COMMENT_THREAD_LINE_HIT_PX}px`,
          }}
        >
          <span
            className={cx(
              THREAD_LEVEL_BRANCH_SEGMENT,
              'w-px shrink-0 transition-colors',
              listSpineLit ? THREAD_SEGMENT_HI : THREAD_SEGMENT_DIM
            )}
          />
        </button>
      )}
      {comments.map((comment, index) => {
        const isLastReply = index === comments.length - 1;
        const childReplies = Array.isArray(comment.replies) ? comment.replies : [];
        const childHasReplies = childReplies.length > 0;
        const connectorsLit =
          parentCommentId != null && !rowDefersConnectorHighlightToNestedRow(comment, hi.focus) && parentBundle;
        const pathStroke = connectorsLit ? THREAD_SEGMENT_HI_STROKE : THREAD_SEGMENT_DIM_STROKE;
        const spanFill = connectorsLit ? THREAD_SEGMENT_HI : THREAD_SEGMENT_DIM;
        return (
          <div key={comment.id} className="comment-branch-row relative" ref={isLastReply ? lastReplyRef : undefined}>
            <div className="comment-branch-row-connectors pointer-events-none absolute inset-0 z-[1]">
              {isLastReply ? (
                childHasReplies ? (
                  <button
                    type="button"
                    aria-expanded={!isThreadCollapsed(comment.id)}
                    aria-label={isThreadCollapsed(comment.id) ? 'Expand comment thread' : 'Collapse comment thread'}
                    onClick={() => toggleThreadCollapsed(comment.id)}
                    onPointerEnter={() => hi.setParentThreadFocus(parentCommentId!)}
                    onFocus={() => hi.setParentThreadFocus(parentCommentId!)}
                    onPointerDown={() => hi.pressSpineForListParent(parentCommentId!)}
                    {...branchLeave}
                    className="comment-branch-hit comment-branch-parent-hit pointer-events-auto absolute cursor-pointer border-0 bg-transparent p-0"
                    style={{ left: '-28px', top: '-2px', width: '28px', height: `${density.avatarCenterPx + 6}px` }}
                  >
                    <svg
                      className="pointer-events-none overflow-visible"
                      style={{ width: '28px', height: `${density.avatarCenterPx}px` }}
                      viewBox={`0 0 28 ${density.avatarCenterPx}`}
                      fill="none"
                    >
                      <path
                        d={elbowPath}
                        strokeWidth="1"
                        fill="none"
                        className={cx(THREAD_LEVEL_BRANCH_SEGMENT, 'transition-colors', pathStroke)}
                      />
                    </svg>
                  </button>
                ) : (
                  <svg
                    className="pointer-events-none absolute overflow-visible"
                    style={{ left: '-28px', top: 0, width: '28px', height: `${density.avatarCenterPx}px` }}
                    viewBox={`0 0 28 ${density.avatarCenterPx}`}
                    fill="none"
                  >
                    <path
                      d={elbowPath}
                      strokeWidth="1"
                      fill="none"
                      className={cx(THREAD_LEVEL_BRANCH_SEGMENT, 'transition-colors', pathStroke)}
                    />
                  </svg>
                )
              ) : childHasReplies ? (
                <button
                  type="button"
                  aria-expanded={!isThreadCollapsed(comment.id)}
                  aria-label={isThreadCollapsed(comment.id) ? 'Expand comment thread' : 'Collapse comment thread'}
                  onClick={() => toggleThreadCollapsed(comment.id)}
                  onPointerEnter={() => hi.setParentThreadFocus(parentCommentId!)}
                  onFocus={() => hi.setParentThreadFocus(parentCommentId!)}
                  onPointerDown={() => hi.pressSpineForListParent(parentCommentId!)}
                  {...branchLeave}
                  className="comment-branch-hit comment-branch-parent-hit pointer-events-auto absolute -translate-y-1/2 cursor-pointer border-0 bg-transparent p-0"
                  style={{ left: '-28px', top: `${density.avatarCenterPx}px`, width: '28px', height: '12px' }}
                >
                  <span
                    className={cx(
                      THREAD_LEVEL_BRANCH_SEGMENT,
                      'absolute top-1/2 left-0 h-px w-[28px] -translate-y-1/2 transition-colors',
                      spanFill
                    )}
                  />
                </button>
              ) : (
                <div
                  className={cx(
                    THREAD_LEVEL_BRANCH_SEGMENT,
                    'pointer-events-none absolute h-px transition-colors',
                    spanFill
                  )}
                  style={{ left: '-28px', top: `${density.avatarCenterPx}px`, width: '28px' }}
                />
              )}
            </div>
            <CommentItem
              comment={comment}
              entityId={entityId}
              spaceId={spaceId}
              onReply={onReply}
              onEdit={onEdit}
              personalSpaceId={personalSpaceId}
              editorSpaceIds={editorSpaceIds}
              isThreadCollapsed={isThreadCollapsed}
              toggleThreadCollapsed={toggleThreadCollapsed}
              sortReplies={sortReplies}
              isLoggedIn={isLoggedIn}
              onSignInRequired={onSignInRequired}
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
  personalSpaceId,
  editorSpaceIds,
  isThreadCollapsed,
  toggleThreadCollapsed,
  sortReplies,
  isLoggedIn,
  onSignInRequired,
  isLast,
  depth,
  ancestors,
}: {
  comment: CommentWithReplies;
  entityId: string;
  spaceId: string;
  onReply: (text: string, ancestorComments?: Array<{ id: string; spaceId: string }>) => void;
  onEdit: (commentId: string, commentSpaceId: string, newText: string) => void;
  personalSpaceId: string | null;
  editorSpaceIds: Set<string>;
  isThreadCollapsed: (commentId: string) => boolean;
  toggleThreadCollapsed: (commentId: string) => void;
  sortReplies: (items: CommentWithReplies[]) => CommentWithReplies[];
  isLoggedIn: boolean;
  onSignInRequired: () => void;
  isLast: boolean;
  depth: number;
  ancestors: Array<{ id: string; spaceId: string }>;
}) {
  const hi = useCommentBranchHighlight();
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const threadCollapsed = isThreadCollapsed(comment.id);

  const isOwnComment = personalSpaceId != null && comment.spaceId === personalSpaceId;

  const handleReply = (text: string) => {
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

  const density = useCommentDensity();
  const replies = Array.isArray(comment.replies) ? comment.replies : [];
  const sortedReplies = React.useMemo(() => sortReplies(replies), [replies, sortReplies]);
  const hasReplies = replies.length > 0;
  const nestedSpineLeftPx = -28;
  /** Horizontal center of the branch line for the toggle (`commentRef` coordinates): */
  const threadLineCenterXFromRootPx = depth === 0 || hasReplies ? density.avatarCenterPx : nestedSpineLeftPx;
  const threadLineStrokeCenterNudgePx = 0.5;
  /** X of thread line relative to body inner left (vote row). */
  const threadToggleLeftInBodyPx = threadLineCenterXFromRootPx - density.bodyInsetPx;
  const commentRef = React.useRef<HTMLDivElement>(null);
  const repliesRef = React.useRef<HTMLDivElement>(null);
  const [parentLineHeight, setParentLineHeight] = React.useState<number | null>(null);

  const showThreadToggle = threadCollapsed || !isEditing;
  const showBranchCollapseButton = hasReplies;
  /** Collapsed: tap empty header space to the right of metadata to expand (leaf or thread). */
  const collapsedHeaderBlankExpands = !isEditing;
  /** Expanded header: tap empty space to the right of metadata to collapse (same as − for threads). */
  const expandedHeaderBlankCollapsesThread = !isEditing;

  const parentThreadLeave = branchPointerBlurProps(hi.clearFocus);

  // Measure the distance from the avatar bottom to where the nested replies container starts
  React.useLayoutEffect(() => {
    if (!hasReplies || threadCollapsed) {
      setParentLineHeight(null);
      return;
    }
    if (commentRef.current && repliesRef.current) {
      const commentRect = commentRef.current.getBoundingClientRect();
      const repliesRect = repliesRef.current.getBoundingClientRect();
      // The spine starts below the avatar, so drop that much off its length.
      setParentLineHeight(repliesRect.top - commentRect.top - density.avatarPx);
    }
  }, [hasReplies, threadCollapsed, replies.length, isEditing, isReplying, density.avatarPx]);

  const expandedHeaderRow = (
    <div className="flex items-center gap-3">
      <div
        className="flex shrink-0 items-center justify-center"
        style={{ width: density.avatarPx, height: density.avatarPx }}
      >
        <a
          href={NavUtils.toSpace(comment.author.spaceId)}
          className="relative shrink-0 overflow-hidden rounded-full"
          style={{ width: density.avatarPx, height: density.avatarPx }}
        >
          <Avatar avatarUrl={comment.author.avatarUrl} value={comment.author.address} size={density.avatarPx} />
        </a>
      </div>
      {/* Single line, no wrapping: a wrapped header doubles the row height, and
          because the avatar is centred against it the body ends up stranded far
          below the name. A long name truncates instead. */}
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-hidden">
        <a href={NavUtils.toSpace(comment.author.spaceId)} className="min-w-0 truncate hover:underline">
          <span className={cx(density.nameClass, 'text-text')}>{comment.author.name ?? 'Anonymous'}</span>
        </a>
        {/* While publishing, this stands in for the timestamp — a just-posted
            comment has no meaningful age yet, and showing both read as noise. */}
        <span className={cx(density.metaClass, 'shrink-0 whitespace-nowrap text-grey-04')}>
          {comment.isPublishing ? 'Publishing…' : relativeTime}
        </span>
        <CommentVoteBadge authorSpaceId={comment.author.spaceId} />
        {comment.resolved && (
          <span className="text-resultSuccess inline-flex shrink-0 items-center gap-1 rounded-full bg-successTertiary px-2 py-0.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6L5 8.5L9.5 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-xs font-medium">Resolved</span>
          </span>
        )}
        {expandedHeaderBlankCollapsesThread && (
          <button
            type="button"
            aria-expanded
            aria-label={hasReplies ? 'Collapse comment thread' : 'Collapse comment'}
            onClick={() => toggleThreadCollapsed(comment.id)}
            {...(hasReplies
              ? {
                  onPointerEnter: () => hi.setParentThreadFocus(comment.id),
                  onFocus: () => hi.setParentThreadFocus(comment.id),
                  onPointerDown: () => hi.pressSpineForListParent(comment.id),
                  ...parentThreadLeave,
                }
              : {})}
            className={
              hasReplies
                ? 'comment-branch-parent-hit min-h-8 min-w-12 flex-1 basis-0 cursor-pointer border-0 bg-transparent p-0'
                : 'min-h-8 min-w-12 flex-1 basis-0 cursor-pointer border-0 bg-transparent p-0'
            }
          />
        )}
      </div>
    </div>
  );

  const parentSpineLineLit = hi.focus?.kind === 'parent-thread' && hi.focus.threadCommentId === comment.id;

  const expandedBodyMain = (
    <>
      {isEditing ? (
        <CommentInput
          onSubmit={handleEdit}
          placeholder="Edit your comment..."
          autoFocus
          onCancel={() => setIsEditing(false)}
          initialValue={comment.markdownContent}
        />
      ) : (
        <div
          className={cx(
            'prose prose-sm max-w-none text-text [&_a]:text-ctaPrimary [&_h1]:text-mediumTitle [&_h2]:text-smallTitle [&_h3]:font-semibold [&_p]:my-1',
            density.bodyClass
          )}
        >
          {renderedContent}
        </div>
      )}

      {!isEditing && (
        <div className="relative mt-2 flex items-center gap-4">
          {showThreadToggle && showBranchCollapseButton && (
            <button
              type="button"
              aria-expanded
              aria-label="Collapse comment thread"
              onClick={() => toggleThreadCollapsed(comment.id)}
              onPointerEnter={() => hi.setParentThreadFocus(comment.id)}
              onFocus={() => hi.setParentThreadFocus(comment.id)}
              onPointerDown={() => hi.pressSpineForListParent(comment.id)}
              {...parentThreadLeave}
              className="comment-branch-parent-hit pointer-events-auto absolute top-1/2 z-[2] flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-grey-02 bg-bg text-grey-04 hover:bg-grey-01"
              style={{
                left: `calc(${threadToggleLeftInBodyPx}px + ${threadLineStrokeCenterNudgePx}px)`,
              }}
            >
              <span className="inline-flex scale-[0.55] leading-none">
                <Minus color="grey-04" />
              </span>
            </button>
          )}
          <EntityVoteButtons entityId={comment.id} spaceId={comment.spaceId} />
          <button
            onClick={() => {
              if (!isLoggedIn) {
                onSignInRequired();
                return;
              }
              setIsReplying(!isReplying);
            }}
            className={cx(density.metaClass, 'text-grey-04 hover:text-text')}
          >
            Reply
          </button>
          {isOwnComment && (
            <button
              onClick={() => setIsEditing(true)}
              className={cx(density.metaClass, 'text-grey-04 hover:text-text')}
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

      {isReplying && (
        <div className="mt-3">
          <CommentInput
            onSubmit={handleReply}
            placeholder={`Reply to ${comment.author.name ?? 'comment'}...`}
            autoFocus
            onCancel={() => setIsReplying(false)}
          />
        </div>
      )}

      {replies.length > 0 && (
        <div className={cx('mt-4', hasReplies && 'comment-replies-slot')} ref={repliesRef}>
          <CommentList
            comments={sortedReplies}
            entityId={entityId}
            spaceId={spaceId}
            onReply={onReply}
            onEdit={onEdit}
            personalSpaceId={personalSpaceId}
            editorSpaceIds={editorSpaceIds}
            isThreadCollapsed={isThreadCollapsed}
            toggleThreadCollapsed={toggleThreadCollapsed}
            sortReplies={sortReplies}
            isLoggedIn={isLoggedIn}
            onSignInRequired={onSignInRequired}
            depth={depth + 1}
            ancestors={[{ id: comment.id, spaceId: comment.spaceId }, ...ancestors]}
            parentCommentId={comment.id}
          />
        </div>
      )}
    </>
  );

  return (
    <div ref={commentRef} className={cx('relative', !isLast && 'mb-6')}>
      {threadCollapsed ? (
        <div className="flex min-h-8 items-center gap-3">
          <div className="flex shrink-0 items-center justify-center" style={{ width: density.avatarPx }}>
            {showThreadToggle && (
              <button
                type="button"
                aria-expanded={false}
                aria-label={hasReplies ? 'Expand comment thread' : 'Expand comment'}
                onClick={() => toggleThreadCollapsed(comment.id)}
                className="z-[2] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-grey-02 bg-bg text-grey-04 hover:bg-grey-01"
              >
                <span className="inline-flex scale-[0.55] leading-none">
                  <Plus color="grey-04" />
                </span>
              </button>
            )}
          </div>
          <div className="flex min-h-8 min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-hidden">
            <a href={NavUtils.toSpace(comment.author.spaceId)} className="min-w-0 truncate hover:underline">
              <span className={cx(density.nameClass, 'text-text')}>{comment.author.name ?? 'Anonymous'}</span>
            </a>
            <span className={cx(density.metaClass, 'shrink-0 whitespace-nowrap text-grey-04')}>
              {comment.isPublishing ? 'Publishing…' : relativeTime}
            </span>
            <CommentVoteBadge authorSpaceId={comment.author.spaceId} />
            {collapsedHeaderBlankExpands && (
              <button
                type="button"
                aria-expanded={false}
                aria-label={hasReplies ? 'Expand comment thread' : 'Expand comment'}
                onClick={() => toggleThreadCollapsed(comment.id)}
                className="min-h-8 min-w-12 flex-1 basis-0 cursor-pointer border-0 bg-transparent p-0"
              />
            )}
          </div>
        </div>
      ) : hasReplies ? (
        <div className="thread-branch-hover-root relative">
          {parentLineHeight != null && parentLineHeight > 0 && (
            <button
              type="button"
              aria-label="Collapse comment thread"
              onClick={() => toggleThreadCollapsed(comment.id)}
              onPointerEnter={() => hi.setParentThreadFocus(comment.id)}
              onFocus={() => hi.setParentThreadFocus(comment.id)}
              onPointerDown={() => hi.pressSpineForListParent(comment.id)}
              {...parentThreadLeave}
              className="comment-branch-parent-hit comment-branch-parent-spine absolute z-[1] flex -translate-x-1/2 cursor-pointer justify-center border-0 bg-transparent p-0"
              style={{
                left: `${density.avatarCenterPx}px`,
                // Starts just below the avatar it descends from.
                top: `${density.avatarPx}px`,
                height: `${parentLineHeight}px`,
                width: `${COMMENT_THREAD_LINE_HIT_PX}px`,
              }}
            >
              <span
                className={cx(
                  THREAD_LEVEL_BRANCH_SEGMENT,
                  'w-px shrink-0 transition-colors',
                  parentSpineLineLit ? THREAD_SEGMENT_HI : THREAD_SEGMENT_DIM
                )}
              />
            </button>
          )}
          {expandedHeaderRow}
          <div className="comment-body-slot mt-1" style={{ marginLeft: density.bodyInsetPx }}>
            {expandedBodyMain}
          </div>
        </div>
      ) : (
        <>
          {expandedHeaderRow}
          <div className="mt-1" style={{ marginLeft: density.bodyInsetPx }}>
            {expandedBodyMain}
          </div>
        </>
      )}
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
