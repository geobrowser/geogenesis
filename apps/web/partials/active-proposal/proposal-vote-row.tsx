'use client';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import pluralize from 'pluralize';

import { VoteWithProfile } from '~/core/io/dto/proposals';

import { Avatar } from '~/design-system/avatar';
import { ChevronDown } from '~/design-system/icons/chevron-down';
import { Close } from '~/design-system/icons/close';
import { Tick } from '~/design-system/icons/tick';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

interface Props {
  votes: VoteWithProfile[];
  votesCount: number;
  yesVotesPercentage: number;
  noVotesPercentage: number;
}

export function ProposalVoteRow({ votes, votesCount, yesVotesPercentage, noVotesPercentage }: Props) {
  const [showingVoters, setShowingVoters] = React.useState(false);

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
            <div className="absolute top-0 bottom-0 left-0 bg-green" style={{ width: `${yesVotesPercentage}%` }} />
          </div>
          <div className="shrink-0 tabular-nums">{yesVotesPercentage}%</div>
        </div>
        <button
          type="button"
          onClick={() => setShowingVoters(v => !v)}
          className="inline-flex shrink-0 items-center gap-1 rounded text-metadataMedium text-grey-04 hover:text-text"
          aria-expanded={showingVoters}
        >
          <span>
            {votesCount} {pluralize('voter', votesCount)}
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
            <div className="absolute top-0 bottom-0 left-0 bg-red-01" style={{ width: `${noVotesPercentage}%` }} />
          </div>
          <div className="shrink-0 tabular-nums">{noVotesPercentage}%</div>
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
