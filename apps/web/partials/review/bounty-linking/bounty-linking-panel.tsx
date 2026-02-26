'use client';

import * as React from 'react';

import { SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Gem } from '~/design-system/icons/gem';

import { BountyCard } from './bounty-card';
import type { Bounty } from './types';

interface BountyLinkingPanelProps {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  selectedBountyIds: Set<string>;
  setSelectedBountyIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  bounties: Bounty[];
}

export function BountyLinkingPanel({
  isOpen,
  setIsOpen,
  selectedBountyIds,
  setSelectedBountyIds,
  bounties,
}: BountyLinkingPanelProps) {
  const handleToggleBounty = (bountyId: string) => {
    setSelectedBountyIds(prev => {
      const next = new Set(prev);
      if (next.has(bountyId)) {
        next.delete(bountyId);
      } else {
        next.add(bountyId);
      }
      return next;
    });
  };

  const selectedCount = selectedBountyIds.size;

  if (!isOpen) return null;

  return (
    <div className="mb-2 mr-2 flex w-[400px] shrink-0 flex-col overflow-hidden rounded-lg bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-grey-02 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-purple">
            <Gem color="purple" />
          </span>
          <span className="text-body text-text">
            {selectedCount} {selectedCount === 1 ? 'bounty' : 'bounties'} linked
          </span>
        </div>
        <SquareButton onClick={() => setIsOpen(false)} icon={<Close />} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col divide-y divide-grey-02">
          {bounties.map(bounty => (
            <BountyCard
              key={bounty.id}
              bounty={bounty}
              isSelected={selectedBountyIds.has(bounty.id)}
              onToggle={handleToggleBounty}
            />
          ))}
        </div>

        {bounties.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-body text-grey-04">No allocated bounties available to link in current space</p>
          </div>
        )}
      </div>
    </div>
  );
}
