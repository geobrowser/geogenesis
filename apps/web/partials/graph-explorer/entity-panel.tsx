'use client';

import * as React from 'react';

import type { ClaimAbout } from '~/core/graph-explorer/claims-about';
import { HOP1_PER_KIND } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import type { GraphCentre } from '~/core/graph-explorer/graph-entity';
import { type Spoke, groupSpokesByLabel } from '~/core/graph-explorer/spokes';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { EntityAvatar } from './entity-avatar';
import { GraphClaimList } from './graph-claim-list';

export type EntityPanelTab = 'details' | 'relationships' | 'claims';

export type EntityPanelEmptyMessages = { relationships: string; claims: string; description: string };

export function typeNames(entity: { types: Array<{ name: string | null }> }): string[] {
  return [...new Set(entity.types.map(type => type.name).filter((name): name is string => Boolean(name)))];
}

export function EntityPanel({
  centre,
  centreSpaceId,
  spokes,
  claimPages,
  claimsState,
  tab,
  onTabChange,
  onSelect,
  truncated,
  emptyMessages,
  summary,
  showClaims = true,
}: {
  centre: GraphCentre;
  centreSpaceId: string | null;
  spokes: Spoke[];
  /** Claims about the centre, one array per loaded page. */
  claimPages: ClaimAbout[][];
  claimsState: {
    isLoading: boolean;
    isError: boolean;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => void;
  };
  tab: EntityPanelTab;
  onTabChange: (tab: EntityPanelTab) => void;
  onSelect: (spoke: Spoke) => void;
  truncated: boolean;
  emptyMessages: EntityPanelEmptyMessages;
  /** Shown between the header and the tabs. */
  summary?: React.ReactNode;
  /** False for a claim centre, whose related claims are already among its relations. */
  showClaims?: boolean;
}) {
  const claimCount = claimPages.reduce((total, page) => total + page.length, 0);
  const claimsCount = claimsState.isLoading ? '…' : `${claimCount}${claimsState.hasNextPage ? '+' : ''}`;
  const tabs: Array<{ id: EntityPanelTab; label: string }> = [
    { id: 'details', label: 'Details' },
    { id: 'relationships', label: `Relationships (${spokes.length}${truncated ? '+' : ''})` },
    ...(showClaims ? [{ id: 'claims' as const, label: `Claims (${claimsCount})` }] : []),
  ];
  const current = tabs.some(entry => entry.id === tab) ? tab : 'details';

  return (
    <section aria-label={`About ${centre.name ?? centre.id}`} className="flex min-h-0 flex-col gap-4">
      <div className="flex items-start gap-3">
        <EntityAvatar entity={centre} size={48} />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-mediumTitle wrap-break-word text-text">{centre.name ?? centre.id}</h2>
          <div className="flex flex-wrap gap-1">
            {typeNames(centre).map(name => (
              <span key={name} className="rounded border border-grey-02 px-1.5 text-footnote text-grey-04">
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {summary}

      <div role="tablist" aria-label="Entity details" className="flex gap-4 border-b border-grey-02">
        {tabs.map(entry => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`graph-tab-${entry.id}`}
            aria-selected={current === entry.id}
            aria-controls={`graph-tabpanel-${entry.id}`}
            className={`-mb-px border-b-2 pb-2 text-metadataMedium transition-colors ${
              current === entry.id ? 'border-text text-text' : 'border-transparent text-grey-04 hover:text-text'
            }`}
            onClick={() => onTabChange(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`graph-tabpanel-${current}`}
        aria-labelledby={`graph-tab-${current}`}
        className="min-h-0"
      >
        {current === 'details' && (
          <DetailsTab centre={centre} centreSpaceId={centreSpaceId} emptyMessage={emptyMessages.description} />
        )}
        {current === 'relationships' && (
          <RelationshipsTab
            spokes={spokes}
            onSelect={onSelect}
            truncated={truncated}
            emptyMessage={emptyMessages.relationships}
          />
        )}
        {current === 'claims' && (
          <ClaimsTab pages={claimPages} state={claimsState} emptyMessage={emptyMessages.claims} />
        )}
      </div>
    </section>
  );
}

function DetailsTab({
  centre,
  centreSpaceId,
  emptyMessage,
}: {
  centre: GraphCentre;
  centreSpaceId: string | null;
  emptyMessage: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {centre.description ? (
        <p className="text-body whitespace-pre-line text-text">{centre.description}</p>
      ) : (
        <p className="text-body text-grey-04">{emptyMessage}</p>
      )}
      {centreSpaceId && (
        <Link
          href={NavUtils.toEntity(centreSpaceId, centre.id)}
          className="self-start text-metadataMedium text-text underline-offset-2 hover:underline"
        >
          Open page →
        </Link>
      )}
    </div>
  );
}

function RelationshipsTab({
  spokes,
  onSelect,
  truncated,
  emptyMessage,
}: {
  spokes: Spoke[];
  emptyMessage: string;
  onSelect: (spoke: Spoke) => void;
  truncated: boolean;
}) {
  if (spokes.length === 0) return <EmptyNote>{emptyMessage}</EmptyNote>;

  return (
    <div className="flex flex-col gap-4">
      {groupSpokesByLabel(spokes).map(group => (
        <div key={group.label} className="flex flex-col gap-1">
          <h3 className="text-footnote text-grey-04 uppercase">{group.label}</h3>
          <ul className="flex flex-col">
            {group.spokes.map(spoke => (
              <li key={spoke.entity.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-grey-01"
                  onClick={() => onSelect(spoke)}
                >
                  <EntityAvatar entity={spoke.entity} size={28} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-metadataMedium text-text">{spoke.entity.name}</span>
                    <span className="truncate text-footnote text-grey-04">{typeNames(spoke.entity).join(' · ')}</span>
                  </span>
                  <span aria-hidden className="ml-auto text-grey-03">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {truncated && <EmptyNote>Showing the first {HOP1_PER_KIND} of each kind in each direction.</EmptyNote>}
    </div>
  );
}

function ClaimsTab({
  pages,
  state,
  emptyMessage,
}: {
  pages: ClaimAbout[][];
  emptyMessage: string;
  state: {
    isLoading: boolean;
    isError: boolean;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => void;
  };
}) {
  if (state.isLoading) return <Skeleton className="h-[120px] w-full rounded-lg" />;
  const empty = pages.every(page => page.length === 0);
  if (state.isError && empty) return <EmptyNote>Couldn’t load claims.</EmptyNote>;
  if (empty) return <EmptyNote>{emptyMessage}</EmptyNote>;

  return (
    <div className="flex flex-col gap-3">
      <GraphClaimList pages={pages} />
      {state.hasNextPage && (
        <button
          type="button"
          className="self-start text-metadataMedium text-text underline-offset-2 hover:underline disabled:text-grey-04"
          disabled={state.isFetchingNextPage}
          onClick={state.fetchNextPage}
        >
          {state.isFetchingNextPage ? 'Loading…' : 'Show more claims'}
        </button>
      )}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-metadata text-grey-04">{children}</p>;
}
