'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';

import * as React from 'react';

import { Vote } from '~/core/types';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';

interface Props {
  votes: Vote[];
}

export function ShowVoters({ votes }: Props) {
  const [showingVoters, showVoters] = React.useState(false);

  const yesVoters = votes
    .filter(vote => vote.vote === 'ACCEPT')
    .map(v => (
      <Link
        href={v.voter.profileLink ?? ''}
        className="flex items-center gap-2 transition-colors duration-75 hover:text-text"
      >
        <div className="relative h-3 w-3 overflow-hidden rounded-full">
          <Avatar avatarUrl={v.voter.avatarUrl} value={v.voter.address} />
        </div>
        <p className="text-metadataMedium text-grey-04">{v.voter.name ?? v.voter.address}</p>
      </Link>
    ));

  const noVoters = votes
    .filter(vote => vote.vote === 'REJECT')
    .map(v => (
      <Link
        href={v.voter.profileLink ?? ''}
        className="flex items-center gap-2 transition-colors duration-75 hover:text-text"
      >
        <div className="relative h-3 w-3 overflow-hidden rounded-full">
          <Avatar avatarUrl={v.voter.avatarUrl} value={v.voter.address} />
        </div>
        <p className="text-metadataMedium text-grey-04">{v.voter.name ?? v.voter.address}</p>
      </Link>
    ));

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <AnimatePresence mode="wait">
        {showingVoters && (
          <motion.div
            animate={{ height: '100%' }}
            transition={{ duration: 0.5, delay: 1 }}
            className="flex h-auto w-full gap-[60px]"
          >
            <div className="flex w-full items-center gap-3 rounded-lg bg-grey-01 px-3 py-4 text-grey-04">
              {yesVoters}
            </div>

            <div className="flex w-full items-center gap-3 rounded-lg bg-grey-01 px-3 py-4 text-grey-04">
              {noVoters}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div transition={{ duration: 0.1 }} layout="position">
        <SmallButton onClick={() => showVoters(!showingVoters)}>
          {showingVoters ? 'Show voters' : 'Hide voters'}
        </SmallButton>
      </motion.div>
    </div>
  );
}
