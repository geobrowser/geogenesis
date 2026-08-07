'use client';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import pluralize from 'pluralize';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import type { VoteWithProfile } from '~/core/io/dto/proposals';

import { Avatar } from '~/design-system/avatar';
import { ChevronDown } from '~/design-system/icons/chevron-down';
import { Close } from '~/design-system/icons/close';
import { Tick } from '~/design-system/icons/tick';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { useOptimisticVoteChoice } from '~/partials/governance/optimistic-voted-atom';

interface Props {
  votes: VoteWithProfile[];
  votesCount: number;
  yesVotesPercentage: number;
  noVotesPercentage: number;
  /** The proposal being displayed. Used to read the optimistic-vote atom so the
   *  tally bar bumps the instant the user clicks Accept/Reject, without waiting
   *  for the indexer + router.refresh() round-trip. */
  proposalId: string;
}

export function ProposalVoteRow({
  votes,
  votesCount,
  yesVotesPercentage,
  noVotesPercentage,
  proposalId,
}: Props) {
  const [showingVoters, setShowingVoters] = React.useState(false);

  // Detect whether the user's own vote is already in the server-provided list.
  // A vote's `accountId` is a personal-space ID (bytes16 hex, no 0x prefix), NOT
  // a wallet address, so we resolve the connected user's personal-space ID on
  // the client and compare against that. Without this the optimistic overlay
  // would keep adding +1 to the tally even after the server data caught up.
  const { personalSpaceId } = usePersonalSpaceId();
  const userHasVotedOnChain = React.useMemo(() => {
    if (!personalSpaceId) return false;
    const target = personalSpaceId.toLowerCase();
    return votes.some(v => v.accountId.toLowerCase() === target);
  }, [personalSpaceId, votes]);

  const optimisticVote = useOptimisticVoteChoice(proposalId);
  const optimisticOverlay =
    !userHasVotedOnChain && (optimisticVote === 'ACCEPT' || optimisticVote === 'REJECT') ? optimisticVote : null;

  const rawYesCount = votes.filter(v => v.vote === 'ACCEPT').length;
  const rawNoCount = votes.filter(v => v.vote === 'REJECT').length;

  const displayYesCount = optimisticOverlay === 'ACCEPT' ? rawYesCount + 1 : rawYesCount;
  const displayNoCount = optimisticOverlay === 'REJECT' ? rawNoCount + 1 : rawNoCount;
  const displayTotal = optimisticOverlay ? votesCount + 1 : votesCount;

  const displayYesPercentage = optimisticOverlay
    ? displayTotal === 0
      ? 0
      : Math.floor((displayYesCount / displayTotal) * 100)
    : yesVotesPercentage;
  const displayNoPercentage = optimisticOverlay
    ? displayTotal === 0
      ? 0
      : Math.floor((displayNoCount / displayTotal) * 100)
    : noVotesPercentage;

  const yesVoters = votes.filter(vote => vote.vote === 'ACCEPT');
  const noVoters = votes.filter(vote => vote.vote === 'REJECT');

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex w-full items-center gap-4 text-metadataMedium">
        <div className="flex flex-1 items-center gap-2">
          <div className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-grey-04 *:h-2! *:w-auto">
            <Tick />
          </div>
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div
              className="absolute top-0 bottom-0 left-0 bg-green transition-[width] duration-200 ease-out"
              style={{ width: `${displayYesPercentage}%` }}
            />
          </div>
          <div className="shrink-0 tabular-nums">{displayYesPercentage}%</div>
        </div>
        <button
          type="button"
          onClick={() => setShowingVoters(v => !v)}
          className="inline-flex shrink-0 items-center gap-1 rounded text-metadataMedium text-grey-04 hover:text-text"
          aria-expanded={showingVoters}
        >
          <span>
            {displayTotal} {pluralize('voter', displayTotal)}
          </span>
          <span className={cx('transition-transform', showingVoters ? 'rotate-180' : 'rotate-0')}>
            <ChevronDown />
          </span>
        </button>
        <div className="flex flex-1 items-center gap-2">
          <div className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-grey-04 *:h-2! *:w-auto">
            <Close />
          </div>
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div
              className="absolute top-0 bottom-0 left-0 bg-red-01 transition-[width] duration-200 ease-out"
              style={{ width: `${displayNoPercentage}%` }}
            />
          </div>
          <div className="shrink-0 tabular-nums">{displayNoPercentage}%</div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {showingVoters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex w-full gap-3">
              <div className="flex w-1/2 flex-wrap items-center gap-3 rounded-lg bg-grey-01 px-3 py-3 text-grey-04">
                {yesVoters.length === 0 ? (
                  <span className="text-metadataMedium">No yes votes yet</span>
                ) : (
                  yesVoters.map(v => <VoterChip key={v.voter.address} vote={v} />)
                )}
              </div>
              <div className="flex w-1/2 flex-wrap items-center gap-3 rounded-lg bg-grey-01 px-3 py-3 text-grey-04">
                {noVoters.length === 0 ? (
                  <span className="text-metadataMedium">No rejection votes yet</span>
                ) : (
                  noVoters.map(v => <VoterChip key={v.voter.address} vote={v} />)
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VoterChip({ vote }: { vote: VoteWithProfile }) {
  const content = (
    <>
      <div className="relative h-3 w-3 overflow-hidden rounded-full">
        <Avatar avatarUrl={vote.voter.avatarUrl} value={vote.voter.address} />
      </div>
      <p className="text-metadataMedium text-grey-04">{vote.voter.name ?? vote.voter.address}</p>
    </>
  );

  if (!vote.voter.profileLink) {
    return <div className="flex items-center gap-2">{content}</div>;
  }

  return (
    <Link
      href={vote.voter.profileLink}
      className="flex items-center gap-2 transition-colors duration-75 hover:text-text"
    >
      {content}
    </Link>
  );
}
