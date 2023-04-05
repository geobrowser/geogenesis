import * as React from 'react';
import Image from 'next/image';

import { Text } from '~/modules/design-system/text';
import { ZERO_WIDTH_SPACE } from '../../constants';
import { HistoryPanel, HistoryItem } from '../history';
import { Action as IAction, Proposal } from '~/modules/types';
import { Action } from '~/modules/action';

interface Props {
  spaceId: string;
  proposals: Proposal[];
  spaceName?: string;
  spaceImage: string | null;
}

export function SpaceHeader({ spaceImage, proposals, spaceName = ZERO_WIDTH_SPACE }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-5">
        <div className="relative h-14 w-14 overflow-hidden rounded">
          <Image
            objectFit="cover"
            layout="fill"
            src={spaceImage ?? 'https://via.placeholder.com/600x600/FF00FF/FFFFFF'}
            alt={`Cover image for ${spaceName}`}
          />
        </div>
        <Text variant="mainPage" as="h1">
          {spaceName}
        </Text>
      </div>

      {proposals.length > 0 && (
        <HistoryPanel>
          {proposals.map(p => (
            <HistoryItem
              key={p.id}
              name={p.name}
              createdAt={p.createdAt}
              createdBy={p.createdBy}
              changeCount={Action.getChangeCount(
                p.proposedVersions.reduce<IAction[]>((acc, version) => acc.concat(version.actions), [])
              )}
            />
          ))}
        </HistoryPanel>
      )}
    </div>
  );
}
